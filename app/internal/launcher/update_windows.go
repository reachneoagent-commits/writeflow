//go:build windows

package launcher

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"time"
)

// detectInstall(Windows):
//   - 安装目录里有 unins000.exe → 安装版:下载 setup.exe,旧进程退出后由「更新助手」静默安装再重启;
//   - 目录里有 engine\ → 便携版:下载 zip 解到旁边,助手把目录换掉再重启;
//   - 其他(开发时直接跑) → 下好后打开安装包。
func detectInstall() installInfo {
	in := installInfo{Kind: "other", Mode: "manual", Reason: "dev", Suffix: "-windows-x64-setup.exe"}
	if runtime.GOARCH != "amd64" {
		in.Mode, in.Reason, in.Suffix = "none", "unsupported", ""
		return in
	}
	exe, err := os.Executable()
	if err != nil {
		return in
	}
	if p, err := filepath.EvalSymlinks(exe); err == nil {
		exe = p
	}
	in.Exe = exe
	dir := filepath.Dir(exe)
	switch {
	case fileExists(filepath.Join(dir, "unins000.exe")):
		in.Kind, in.Path = "win_installed", dir
		if dirWritable(filepath.Dir(dir)) && dirWritable(dir) {
			in.Mode, in.Reason = "installer", ""
		} else {
			in.Mode, in.Reason = "manual", "readonly"
		}
	case dirExists(filepath.Join(dir, "engine")):
		in.Kind, in.Path, in.Suffix = "win_portable", dir, "-windows-x64-portable.zip"
		if dirWritable(filepath.Dir(dir)) {
			in.Mode, in.Reason = "replace", ""
		} else {
			in.Mode, in.Reason = "manual", "readonly"
		}
	}
	return in
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// prepareApply(Windows):运行中的 exe 和所在目录都换不了,这里只做能提前做的(便携版先解压并试跑新版本),
// 真正的替换交给旧进程退出后的更新助手。
func prepareApply(ctx context.Context, in installInfo, pkg string, args []string, plan *applyPlan, logf func(string, ...any)) error {
	exeName := filepath.Base(in.Exe)
	switch in.Kind {
	case "win_installed":
		if in.Mode != "installer" {
			return errors.New("This copy of the app can't update automatically")
		}
		plan.Kind = "installer"
		plan.Installer = []string{pkg, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/NOCANCEL",
			"/CLOSEAPPLICATIONS", "/LOG=" + filepath.Join(plan.DataDir, "logs", "update-install.log")}
	case "win_portable":
		if in.Mode != "replace" {
			return errors.New("This copy of the app can't update automatically")
		}
		staged := stagedPathFor(in)
		_ = os.RemoveAll(staged)
		logf("Unpacking the new version to %s", staged)
		if err := extractZip(pkg, staged); err != nil {
			_ = os.RemoveAll(staged)
			return fmt.Errorf("Couldn't unpack the new version: %w", err)
		}
		if !fileExists(filepath.Join(staged, exeName)) || !dirExists(filepath.Join(staged, "engine")) {
			_ = os.RemoveAll(staged)
			return errors.New("The new version's archive is incomplete")
		}
		if err := checkVersionOutput(ctx, filepath.Join(staged, exeName), plan.To); err != nil {
			_ = os.RemoveAll(staged)
			return err
		}
		plan.Kind, plan.Staged = "swap", staged
	default:
		return errors.New("This copy of the app can't update automatically")
	}
	plan.Target, plan.Backup = in.Path, backupPathFor(in)
	plan.Relaunch = append([]string{filepath.Join(in.Path, exeName)}, relaunchArgs(args)...)
	plan.Env = []string{"WRITEFLOW_UPDATED_FROM=" + plan.From, "WRITEFLOW_NO_BROWSER=1"}
	plan.WaitPID = os.Getpid()
	return nil
}

// executePlan(Windows):把自己复制成「更新助手」,带着计划启动它,然后本进程退出。
func executePlan(plan *applyPlan, logf func(string, ...any)) {
	dir := filepath.Join(plan.DataDir, "updates")
	_ = os.MkdirAll(dir, 0o755)
	planPath := filepath.Join(dir, "apply-plan.json")
	b, _ := json.MarshalIndent(plan, "", "  ")
	if err := writeFileAtomic(planPath, b); err != nil {
		logf("Couldn't write the update plan: %v", err)
		return
	}
	exe, err := os.Executable()
	if err != nil {
		logf("Couldn't find its own path: %v", err)
		return
	}
	helper := filepath.Join(dir, "writeflow-updater-"+strconv.Itoa(os.Getpid())+".exe")
	if err := copyFile(exe, helper); err != nil {
		logf("Couldn't copy the update helper: %v", err)
		return
	}
	cmd := exec.Command(helper, "--apply-update", planPath)
	cmd.Dir = dir
	detach(cmd)
	if err := cmd.Start(); err != nil {
		logf("Couldn't start the update helper: %v", err)
		return
	}
	_ = cmd.Process.Release()
	logf("Update helper started (pid %d); this process is exiting", cmd.Process.Pid)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

const synchronize = 0x00100000

// waitPIDExit 等旧进程真正退出(文件句柄都放开了)再动它的文件。
func waitPIDExit(pid int, timeout time.Duration) {
	if pid <= 0 {
		return
	}
	h, err := syscall.OpenProcess(synchronize, false, uint32(pid))
	if err != nil {
		return // 已经没了
	}
	defer syscall.CloseHandle(h)
	_, _ = syscall.WaitForSingleObject(h, uint32(timeout/time.Millisecond))
	time.Sleep(300 * time.Millisecond) // 让系统放开映射的 DLL
}

// openPackageFile:安装包直接运行(用户按向导走),zip 在资源管理器里选中。
func openPackageFile(p string) error {
	if filepath.Ext(p) == ".zip" {
		return exec.Command("explorer", "/select,", p).Start()
	}
	return openURL(p)
}
