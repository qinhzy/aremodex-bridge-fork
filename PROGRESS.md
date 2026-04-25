# Progress

## M1: Platform Adapter 抽象与现有行为迁移

打算怎么做：先盘点 phodex-bridge 现有入口、daemon/up/logs/status 相关代码和测试，找出所有平台相关行为的实际边界；然后加入 `src/platform` 抽象骨架，把 macOS 现有 launchd/前台运行/日志/status 行为迁入 `DarwinDaemonManager` 等子接口，把 Linux 现有行为迁入 `LinuxAdapter`，保持 CLI 对外命令和默认路径不变；最后补单元/回归测试，实际运行 M1 四项验收，包括 macOS `up` 零差异验证、Linux 行为验证和 npm test 全绿。若当前机器无法覆盖 macOS 实跑，会把阻塞写清楚并要求真实 macOS 环境补跑，不能把它伪装成已验收。

当前进展：已在 Windows 本机完成 adapter/CLI 迁移和测试可移植性修复，`phodex-bridge` 下 `npm test` 通过 179/179。当前机器没有 WSL、Docker 或 GitHub CLI，无法补 Linux runner；也不是 macOS，无法执行真实 `remodex up` launchd 零差异回归。M1 在提交前仍需要真实 macOS 环境跑 `npm test`、`remodex up`、`remodex status --json`、`remodex reset-pairing` 验收，并需要 Linux runner 跑 `npm test` 与 foreground `up/run` 验收。

结构偏离记录：M1 当前在上游 Remodex 单仓库 fork 中推进，实际工作目录是 `.upstream-remodex/phodex-bridge`，没有先搭 Aremodex monorepo 和 `packages/phodex-bridge/`。这是基于 M1 只改 bridge、当前工作区没有 Android 代码、且需要尽快让 macOS/Linux/Windows CI 验证 adapter 迁移的阶段性判断；它不是对最终仓库结构的永久决策。Beyond M5、开始接入 Android 客户端代码前，必须重新评估是否升级到 monorepo，并确认 bridge fork 与 Aremodex app 的版本号、发布节奏和 CI 边界如何解耦。

## M2: Windows Adapter 最小前台版

打算怎么做：先在现有 `src/platform` 结构下新增 Windows adapter 和三个子接口的最小实现，保持 M2 只做前台运行，不引入 Task Scheduler、WinSW 或托盘；然后把 `aremodex-bridge` CLI alias 接上现有 CLI，新增 `diagnose` 和 Windows foreground 预检，让编码、路径、Codex runtime 探测、防火墙风险提示都集中在 Windows adapter 内。实现时若发现 v2 设计细节不可行，先在本节记录调整理由再改代码。验收会分三层：本机 Windows 跑 `npm test` 和 CLI 诊断；PowerShell 与真实 `cmd.exe` 各跑一次 `aremodex-bridge run` 到 relay 连接阶段并保存终端 log，专门观察 GBK/UTF-8 下 QR 与中文/特殊字符；最后在干净 Windows 11 用户上首次运行 loopback/self-host 流程验证不触发 Defender Firewall 弹窗。GitHub Actions 只能覆盖测试矩阵，不能替代后两项手工验收。

当前进展：已实现 `src/platform/windows/` 最小前台 adapter，并接入 `aremodex-bridge` CLI alias、`diagnose`、Windows 控制台编码预检、路径诊断、Defender Firewall 诊断和原生/WSL/桌面 Codex 探测。本机 Windows 下 `phodex-bridge` 已跑 `npm test`，结果 188/188 通过；`process.platform` 检查仍只有 `phodex-bridge/src/platform/index.js` 一处命中。`aremodex-bridge diagnose --json` 已实跑，能显示原生 Codex、WSL 未安装状态、Codex 桌面应用、`%USERPROFILE%\.codex`、路径长度和 firewall 诊断。PowerShell 与真实 `cmd.exe /d /c` 均已在先切到 GBK 代码页的 smoke 中跑 `aremodex-bridge run` 到 relay connected 阶段，终端日志保存在 `C:\Aremodex(codex版）\m2-validation-logs\powershell-run.log` 和 `C:\Aremodex(codex版）\m2-validation-logs\cmd-run.log`，日志内 QR、`C:\Aremodex(codex版）` 路径和连接状态未出现乱码。为让非交互捕获的 smoke 也覆盖 chcp 分支，Windows adapter 支持 `AREMODEX_FORCE_WINDOWS_CONSOLE=1` 测试开关；默认用户路径仍只在 TTY 前台运行时尝试调整控制台代码页。

M2 当前未验证项：尚未在干净 Windows 11 用户上首次运行 loopback/self-host 流程并观察 Defender Firewall 是否弹窗；尚未 push M2 commit 或跑 Actions。
