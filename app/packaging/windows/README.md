# Windows packaging

`build_win.sh` builds `Writeflow.exe` (Go launcher plus the web page), bundles the llama.cpp engines
(`engine/cpu`, `engine/vulkan`, `engine/cuda`) and produces:

- `Writeflow-<version>-windows-x64-setup.exe` (Inno Setup, installs for the current user, no administrator needed)
- `Writeflow-<version>-windows-x64-portable.zip`

The installer is English only. Uninstalling asks once whether to delete downloaded models and logs. Folders you chose
under Storage location only lose Writeflow's own files. Set `WRITEFLOW_UNINSTALL_DELETE_DATA=1` to delete data without
asking (silent uninstalls and CI).

The Windows build has only had automated smoke tests so far, not testing on many real machines. The installer is not
code-signed, so SmartScreen shows a warning at first (More info, then Run anyway).
