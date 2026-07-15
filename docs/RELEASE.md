# Windows 签名与更新发布

本项目的正式 Windows 发布链路坚持三个原则：**正式包必须签名、更新源必须可验证、秘密不得进入仓库或构建产物**。

日常 `npm run build:win` 仍可生成供本机测试的无签名安装包和便携包；只有 `npm run release:win` 会启用强制签名、更新元数据和发布校验。Electron Builder 官方说明了 NSIS 与 `electron-updater` 的更新流程及 Windows 签名要求：

- [Electron Builder 自动更新](https://www.electron.build/docs/features/auto-update/)
- [Windows 代码签名](https://www.electron.build/docs/features/code-signing/code-signing-win/)
- [发布提供方](https://www.electron.build/docs/publish/)

## 发布产物链路

```text
版本 tag
  → 锁定依赖安装
  → 测试 / 清单 / 依赖审计
  → Electron Builder 强制签名
  → Authenticode 二次验证
  → latest.yml 或 beta.yml + blockmap
  → SHA-256 清单
  → GitHub Release 或自有 HTTPS 文件服务器
```

安装版使用 NSIS 自动更新。便携版不会自修改，用户需要下载新便携包手动替换。渲染进程不访问更新源；检查、下载、签名验证和安装全部由主进程完成。

## 发布前准备

1. 确认 `package.json` 中的版本号为目标版本，例如 `1.1.0`。
2. 稳定版创建完全匹配的 tag，例如 `v1.1.0`；Beta 版使用 `1.2.0-beta.1` 与 `v1.2.0-beta.1`。
3. 保持 `build.appId` 为 `com.datennightgirl.desktop`。第一次公开发布后不要修改，否则 Windows 会把它视为另一个应用。
4. 准备 Windows OV/EV 代码签名证书或 Azure Trusted Signing。
5. GitHub 自动更新仓库必须公开。项目会拒绝需要把访问令牌嵌入客户端的私有更新源。

## GitHub Actions 发布

工作流位于 `.github/workflows/release.yml`，支持推送 `v*` tag 或手动选择已有 tag。建议在 GitHub 的 `production` Environment 中配置必要审批人，并添加：

| Secret | 用途 |
|---|---|
| `WIN_CSC_LINK` | PFX/P12 文件路径、HTTPS 地址或 Base64 内容 |
| `WIN_CSC_KEY_PASSWORD` | 证书密码 |

证书与密码只注入签名步骤。发布令牌使用 GitHub 自动提供的短期 `GITHUB_TOKEN`，仅在上传 Release 时进入环境。GitHub 的 Secret 使用与最小权限原则参见 [GitHub Actions Secrets](https://docs.github.com/en/actions/concepts/security/secrets)。

工作流中的 `actions/checkout`、`actions/setup-node` 和 `actions/upload-artifact` 均固定到具体提交，避免可移动 tag 带来的供应链漂移。

### 仅个人使用的自签名模式

自签名证书不适合公开分发，但可用于只在自己设备上安装的版本。启用方式是在 `production` Environment 中设置变量 `ALLOW_SELF_SIGNED_RELEASE=true`，并继续使用 `WIN_CSC_LINK` 与 `WIN_CSC_KEY_PASSWORD` 两个 Secret。工作流只在该变量明确为 `true` 时执行以下操作：

1. 验证证书确实为自签名证书并包含代码签名用途；
2. 从 PFX Secret 在内存中取得预期证书指纹，不把证书加入运行器信任库；
3. 只接受签名完整、证书指纹完全匹配且失败原因仅为“不受公共信任”的产物。哈希不匹配、未签名或签名证书漂移仍会失败。

自签名安装包在首次运行时仍可能显示 Windows 警告，这是个人模式的预期行为。如果希望当前账户信任该发布者，可手动审查并导入对应的公开 `.cer` 证书；工作流不会修改任何 Windows 信任库。不要把 PFX、私钥或密码提交到仓库。将 `ALLOW_SELF_SIGNED_RELEASE` 删除或设为 `false` 即可恢复正式证书模式。

## 本地预检

PowerShell 示例：

```powershell
$env:RELEASE_PROVIDER = 'github'
$env:RELEASE_REPOSITORY = 'owner/repository'
$env:RELEASE_TAG = 'v1.0.0'
$env:WIN_CSC_LINK = 'C:\secure\codesign.pfx'
$env:WIN_CSC_KEY_PASSWORD = '从安全凭据管理器读取'

npm run release:preflight
npm run release:win
```

预检只输出版本、通道、目标仓库和签名模式，不输出证书、密码、Azure Secret 或发布令牌。缺少任何关键配置都会在构建前失败。

## 签名模式

### PFX（默认）

设置 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`。CI 最适合使用 Base64 编码的可导出 OV 证书。

### Windows 证书存储

适合已经安装证书或使用硬件 EV 证书的 Windows 机器：

```powershell
$env:SIGNING_MODE = 'store'
$env:WIN_CERTIFICATE_SUBJECT_NAME = '证书的 Issued to / Subject 名称'
```

### Azure Trusted Signing

```powershell
$env:SIGNING_MODE = 'azure'
$env:AZURE_TENANT_ID = '...'
$env:AZURE_CLIENT_ID = '...'
$env:AZURE_CLIENT_SECRET = '...'
$env:AZURE_TRUSTED_SIGNING_ENDPOINT = 'https://<region>.codesigning.azure.net'
$env:AZURE_CODE_SIGNING_ACCOUNT_NAME = '...'
$env:AZURE_CERTIFICATE_PROFILE_NAME = '...'
$env:AZURE_PUBLISHER_NAME = '...'
```

这些值都必须通过 CI Secret 或受控凭据管理器提供，不要写入 `.env`、PowerShell 脚本、日志或仓库。

## 发布提供方

### 公开 GitHub Releases

```powershell
$env:RELEASE_PROVIDER = 'github'
$env:RELEASE_REPOSITORY = 'owner/repository'
```

Electron Builder 会生成带 GitHub 提供方信息的 `app-update.yml` 和 `latest.yml`/`beta.yml`。CI 使用 GitHub CLI 创建 Release 并上传安装包、便携包、blockmap、更新元数据和校验清单。

### 自有 HTTPS 文件服务器

```powershell
$env:RELEASE_PROVIDER = 'generic'
$env:UPDATE_URL = 'https://updates.example.com/date-night-girl'
```

地址必须是没有用户名、密码、查询参数或 fragment 的 HTTPS URL。通用服务器不会由 Electron Builder 自动上传，需要把 `dist` 中的安装包、对应 blockmap、`latest.yml`/`beta.yml` 和 `release-checksums.sha256` 原样上传到该目录。

## 发布后验证

1. 在全新 Windows 用户环境安装上一版本的**签名 NSIS 安装版**。
2. 发布更高版本；版本号必须递增，不能覆盖已有版本。
3. 打开“房间设置 → 应用更新”，执行“立即检查”。
4. 确认下载进度、Windows 签名验证、重启安装和数据保留均正常。
5. 核对安装包的 Authenticode 签名、`release-checksums.sha256` 和 Release 页面文件一致。

不要只用 `win-unpacked` 或便携版测试自动更新。官方建议在真实安装版上测试 Windows 更新。

## 故障与回滚

- **预检提示缺少证书**：检查选择的 `SIGNING_MODE` 及对应 Secret；正式构建不会降级成无签名包。
- **签名状态不是 Valid**：检查证书有效期、时间戳服务、Subject 和证书链。
- **没有生成 `latest.yml`**：确认发布提供方配置完整，并使用 `release:win` 而非 `build:win`。
- **客户端显示“此构建未配置可信发布源”**：当前安装包内部没有 `app-update.yml`，重新安装正式发布包。
- **错误版本已经发布**：发布一个更高的修复版本。不要复用或覆盖已经分发的版本号。
- **需要停止自动更新**：暂时撤下更新元数据；修复后用更高版本重新发布。已经下载的版本仍可能在退出时安装，因此严重事件应尽快发布修复版。
