package launcher

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type instanceInfo struct {
	PID       int    `json:"pid"`
	Port      int    `json:"port"`
	EnginePID int    `json:"engine_pid,omitempty"`
	Version   string `json:"version,omitempty"`
}

type multiFlag []string

func (m *multiFlag) String() string     { return strings.Join(*m, ";") }
func (m *multiFlag) Set(v string) error { *m = append(*m, v); return nil }

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// Main 是启动器入口,返回进程退出码。
func Main(o Options) int {
	fl := flag.NewFlagSet("writeflow", flag.ContinueOnError)
	dataDirFlag := fl.String("data-dir", os.Getenv("WRITEFLOW_DATA_DIR"), "Data folder (settings, logs, update packages; the model folder is changed in the page). If not given, the system default or the location chosen in the page is used")
	var engines multiFlag
	fl.Var(&engines, "engine", "Path to llama-server, as name=path, can repeat (for development and testing)")
	baseURL := fl.String("base-url", envOr("WRITEFLOW_BASE_URL", os.Getenv("HF_ENDPOINT")), "Custom download source (instead of huggingface.co)")
	noBrowser := fl.Bool("no-browser", os.Getenv("WRITEFLOW_NO_BROWSER") != "", "Don't open the browser automatically")
	webDir := fl.String("web-dir", os.Getenv("WRITEFLOW_WEB_DIR"), "Read the web page from disk (for development; refresh to see changes)")
	port := fl.Int("port", atoiOr(os.Getenv("WRITEFLOW_PORT"), 0), "Web page port (by default the fixed port from the configuration, so history isn't lost)")
	idle := fl.Int("idle-exit", atoiOr(os.Getenv("WRITEFLOW_IDLE_EXIT"), -1), "Minutes after the page closes before exiting automatically; 0 = never exit, -1 = use the configuration")
	serve := fl.Bool("serve", false, "Run the service in the foreground (used inside the macOS .app)")
	showVer := fl.Bool("version", false, "Print the version")
	updateAPI := fl.String("update-api", os.Getenv("WRITEFLOW_UPDATE_API"), "GitHub API address used to check for app updates (point at a fake server for development and testing)")
	applyPlanPath := fl.String("apply-update", "", "Internal use: replace and restart according to the update plan (Windows update helper)")
	fl.SetOutput(io.Discard)
	var args []string
	for _, a := range o.Args { // 老版本 Finder 会塞一个 -psn_0_xxx
		if !strings.HasPrefix(a, "-psn_") {
			args = append(args, a)
		}
	}
	if err := fl.Parse(args); err != nil {
		fl.SetOutput(os.Stderr)
		fl.PrintDefaults()
		return 2
	}
	if *showVer {
		fmt.Println("writeflow", o.Version)
		return 0
	}
	if *applyPlanPath != "" {
		return runApplyHelper(*applyPlanPath)
	}
	// 存储位置:命令行 / 环境变量(钉死,网页上不让改运行目录) > 默认目录里的 location.json > 默认目录。
	// 路径一律是绝对路径:引擎的工作目录不是这里。
	sp := resolveStartPaths(*dataDirFlag)
	dataDir := sp.DataDir
	if e := os.Getenv("WRITEFLOW_ENGINE"); e != "" && len(engines) == 0 {
		engines = append(engines, e)
	}

	if err := os.MkdirAll(filepath.Join(dataDir, "logs"), 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "Couldn't create the data folder: ", err)
		return 1
	}

	// 已经有一个在跑:直接打开它的页面
	if inst, ok := runningInstance(dataDir); ok {
		u := fmt.Sprintf("http://127.0.0.1:%d/", inst.Port)
		fmt.Println("Writeflow is already running:", u)
		if !*noBrowser {
			_ = openURL(u)
		}
		return 0
	}

	// macOS 双击 .app:前台进程只负责把服务拉到后台然后立刻退出。
	// 这样 LaunchServices 认为 App 已结束,下次双击会再启动一个前台进程,
	// 它发现服务在跑就直接打开网页(纯 Go 程序收不到 "reopen" 事件,只能这么做)。
	if runtime.GOOS == "darwin" && !*serve && insideAppBundle() {
		return spawnDetached(args)
	}

	logPath := filepath.Join(dataDir, "logs", "launcher.log")
	rotateLog(logPath, 2<<20)
	lf, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	var logw io.Writer = os.Stderr
	if err == nil {
		logw = io.MultiWriter(lf, os.Stderr)
	}
	logger := log.New(logw, "", log.LstdFlags)
	logger.Printf("===== Writeflow %s start (%s/%s) data folder %s", o.Version, runtime.GOOS, runtime.GOARCH, dataDir)
	if sp.Note != "" {
		logger.Printf("%s", sp.Note)
	}
	logger.Printf("Model folder %s (can be changed under \"Storage location\" in the page)", modelDirLog(sp.DataDir, sp.ModelDir))

	cfg, err := loadConfig(o.DefaultConfig, filepath.Join(dataDir, "config.json"))
	if err != nil {
		logger.Printf("Configuration error: %v", err)
		return 1
	}
	if *baseURL != "" { // 开发/私有镜像:只用这一个下载源
		cfg.Endpoints = []Endpoint{{ID: "custom", Label: strings.TrimPrefix(strings.TrimPrefix(*baseURL, "https://"), "http://"), Base: *baseURL}}
	}
	if *updateAPI != "" {
		cfg.Update.GitHubAPI = *updateAPI
	}

	a := &App{opts: o, cfg: cfg, dataDir: dataDir, logger: logger, logFile: lf, apiKey: randomKey(),
		locModelDir: sp.ModelDir, pointerDir: sp.PointerDir, dataDirLocked: sp.DataDirLock}
	defer func() {
		if a.logFile != nil {
			_ = a.logFile.Close()
		}
	}()
	a.settings = loadSettings(a.settingsPath())
	a.extKey = a.loadExternalKey()
	if _, ok := cfg.endpoint(a.settings.Endpoint); !ok {
		a.settings.Endpoint = cfg.Endpoints[0].ID
	}
	a.sys = detectSys()
	a.backends = discoverBackends(engines, a.sys.GPU)
	logger.Printf("Memory %.1f GB, CPU %q, GPU %+v, %d usable engines", a.sys.RAMGB, a.sys.CPU, a.sys.GPU, len(a.backends))
	for _, b := range a.backends {
		logger.Printf("  engine %-6s %s", b.Name, b.Path)
	}
	a.web = o.Web
	if *webDir != "" {
		a.web = os.DirFS(*webDir)
		logger.Printf("Page read from disk: %s", *webDir)
	}
	switch {
	case *idle >= 0:
		a.idleExit = time.Duration(*idle) * time.Minute
	default:
		a.idleExit = time.Duration(cfg.IdleExitMinutes) * time.Minute
	}

	// 上次被强杀留下的引擎
	if b, err := os.ReadFile(filepath.Join(dataDir, "instance.json")); err == nil {
		var old instanceInfo
		if json.Unmarshal(b, &old) == nil && killStaleEngine(old.EnginePID) {
			logger.Printf("Cleaned up a leftover engine process %d", old.EnginePID)
		}
	}

	if from := os.Getenv("WRITEFLOW_UPDATED_FROM"); from != "" {
		// 刚从 from 更新过来:旧进程刚放开端口,等它一会儿,保证还用原来的端口(浏览器里的历史按端口存)
		logger.Printf("Updated from %s", from)
		want := a.settings.Port
		if *port > 0 {
			want = *port
		}
		waitPortFree(want, 10*time.Second)
	}
	ln, err := listenPreferred(*port, a.settings.Port, cfg.PreferredPort)
	if err != nil {
		logger.Printf("Couldn't listen on the port: %v", err)
		return 1
	}
	a.port = ln.Addr().(*net.TCPAddr).Port
	a.url = fmt.Sprintf("http://127.0.0.1:%d/", a.port)
	if *port == 0 && a.settings.Port != a.port {
		a.settings.Port = a.port
		_ = saveSettings(a.settingsPath(), a.settings)
	}

	ctx, cancel := context.WithCancel(context.Background())
	a.rootCtx = ctx
	a.shutdown = cancel
	a.touch()
	a.writeInstance()

	a.updates = newUpdater(a)
	a.updates.rootCtx = ctx
	a.updates.args = args
	a.updates.requestRestart = func(plan *applyPlan) {
		a.mu.Lock()
		a.afterExit = func() { executePlan(plan, a.logf) }
		a.mu.Unlock()
		time.Sleep(400 * time.Millisecond) // 让网页先看到「正在重启」
		a.shutdown()
	}

	srv := &http.Server{Handler: a.handler(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			logger.Printf("HTTP service error: %v", err)
			cancel()
		}
	}()
	logger.Printf("Page address %s", a.url)
	fmt.Println("Writeflow:", a.url)

	a.boot()
	if !*noBrowser {
		if err := openURL(a.url); err != nil {
			logger.Printf("Couldn't open the browser: %v", err)
		}
	}
	go a.idleLoop(ctx)
	go a.updates.autoLoop(ctx, func() bool {
		a.mu.Lock()
		defer a.mu.Unlock()
		return a.updates.autoEnabled(a.settings)
	}, func() bool {
		a.mu.Lock()
		defer a.mu.Unlock()
		return a.phase == phaseStarting || a.phase == phaseDownloading
	})
	go func() { // 上次更新留下的备份/旧安装包:等几分钟(负责重启的旧进程可能还在用)再清
		if sleepCtx(ctx, 5*time.Minute) {
			a.updates.cleanupStale()
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	select {
	case s := <-sig:
		logger.Printf("Received signal %v; exiting", s)
	case <-ctx.Done():
	}
	cancel()
	a.stopAll()
	sctx, scancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer scancel()
	_ = srv.Shutdown(sctx)
	a.mu.Lock()
	after := a.afterExit
	a.mu.Unlock()
	if after != nil {
		logger.Printf("Service closed; running the update")
		after()
	}
	logger.Printf("Exited")
	return 0
}

// waitPortFree:等某个端口能监听(旧进程刚关,最多等 timeout)。
func waitPortFree(port int, timeout time.Duration) {
	if port <= 0 {
		return
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port)); err == nil {
			l.Close()
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// randomKey:llama-server 默认允许任意网站跨域访问,只靠随机端口不够,
// 加一把每次启动都不同的钥匙,网页只能经过启动器的反代(由它带上钥匙)才能调到引擎。
func randomKey() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func atoiOr(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

// listenPreferred:优先用固定端口。localStorage 按 "源"(含端口)隔离,
// 端口一变,浏览器里的历史记录就看不到了,所以尽量每次都用同一个。
func listenPreferred(forced, saved, preferred int) (net.Listener, error) {
	if forced > 0 {
		return net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", forced))
	}
	var cands []int
	if saved > 0 {
		cands = append(cands, saved)
	}
	for i := 0; i < 10 && preferred > 0; i++ {
		cands = append(cands, preferred+i)
	}
	for _, p := range cands {
		if l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p)); err == nil {
			return l, nil
		}
	}
	return net.Listen("tcp", "127.0.0.1:0")
}

func runningInstance(dataDir string) (instanceInfo, bool) {
	var inst instanceInfo
	b, err := os.ReadFile(filepath.Join(dataDir, "instance.json"))
	if err != nil || json.Unmarshal(b, &inst) != nil || inst.Port <= 0 {
		return inst, false
	}
	c := &http.Client{Timeout: 1500 * time.Millisecond}
	req, _ := http.NewRequest("GET", fmt.Sprintf("http://127.0.0.1:%d/app/ping", inst.Port), nil)
	req.Host = fmt.Sprintf("127.0.0.1:%d", inst.Port)
	resp, err := c.Do(req)
	if err != nil {
		return inst, false
	}
	defer resp.Body.Close()
	var p struct {
		App string `json:"app"`
	}
	if json.NewDecoder(resp.Body).Decode(&p) != nil || p.App != "writeflow" {
		return inst, false
	}
	return inst, true
}

func insideAppBundle() bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	return strings.Contains(exe, ".app/Contents/MacOS/")
}

func spawnDetached(args []string) int {
	exe, err := os.Executable()
	if err != nil {
		return 1
	}
	cmd := exec.Command(exe, append([]string{"--serve"}, args...)...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	detach(cmd)
	if err := cmd.Start(); err != nil {
		fmt.Fprintln(os.Stderr, "Couldn't start the background service: ", err)
		return 1
	}
	_ = cmd.Process.Release()
	return 0
}
