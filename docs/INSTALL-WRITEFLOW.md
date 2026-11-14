# Installing Writeflow

Get Writeflow from the FlowApps launcher (recommended) or from the Releases page of the Writeflow repository.

- **Mac:** Apple silicon (M1 or newer), macOS 13.3 or later. Download `Writeflow-<version>-macos-arm64.dmg`, open it and drag Writeflow to Applications.
- **Windows:** 64-bit Windows. Download `Writeflow-<version>-windows-x64-setup.exe` (installs for your user, no administrator needed) or the portable zip.

## First launch warnings

Writeflow isn't code-signed yet, so your computer shows a warning the first time. This is expected.

- **Mac:** double-click Writeflow, dismiss the warning, then open **System Settings → Privacy & Security**, scroll to the bottom, click **Open Anyway** and confirm. Or run this once in Terminal:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Writeflow.app
  ```
  On macOS 15 and later, right-click → Open no longer skips the warning, so use System Settings.
- **Windows:** at "Windows protected your PC", click **More info**, then **Run anyway**.

## The model

On first launch Writeflow picks a model size that fits your memory and downloads it once (3.9 GB to 12.7 GB). After that it works offline.

| Memory | Model |
|---|---|
| 32 GB or more | Q8_0 (best quality) |
| 16 GB | Q6_K |
| about 14 GB | Q4_K_M |
| 12 GB | Q3 |
| 8 GB | 2-bit (a few more fact slips, so check numbers and names) |

Under 8 GB the model may not load. You can change the size any time with **Model** in the header.

Already use the Humanizer app? In **Storage location**, point Writeflow's models folder at Humanizer's models folder to reuse the file instead of downloading it again. (On Windows, uninstalling Writeflow removes `humanizer-*.gguf` files in a models folder you picked, so keep separate folders if you use both.)

## Where things are stored

- **Mac:** `~/Library/Application Support/Writeflow`
- **Windows:** `%LOCALAPPDATA%\Writeflow` (the program itself is in `%LOCALAPPDATA%\Programs\Writeflow`)

Your text isn't saved by the app except the history list in your browser. The folders can be moved under **Storage location**.

## If something stops working

1. Press **Restart** in the header (it turns coral when the engine reports an error).
2. Still stuck? **More → Open logs folder** shows what happened. Include the log when you report a problem.
3. The Windows build has only had automated checks so far, not testing on many real machines.

## Uninstall

- **Mac:** delete `Writeflow.app` and `~/Library/Application Support/Writeflow` (plus any folders you chose under Storage location).
- **Windows:** uninstall from Settings → Apps (or delete the portable folder), then delete `%LOCALAPPDATA%\Writeflow`. The uninstaller asks once whether to delete data too.
