# New API 项目速览

本文档基于当前仓库源码快速梳理，目标是帮助新接手的人在 10 分钟内知道这个项目是什么、怎么跑、主要代码在哪里，以及改代码时要避开哪些坑。

## 1. 项目定位

New API 是一个大模型 API 网关与 AI 资产管理系统。它把 OpenAI、Claude、Gemini、Azure、AWS Bedrock、阿里云、火山、智谱、Ollama 等多种上游模型服务聚合到统一入口，并提供：

- 兼容 OpenAI / Claude / Gemini 等协议的转发接口；
- 渠道、模型、令牌、用户、分组、额度、日志、订阅和充值管理；
- 失败重试、渠道分发、模型映射、限流、敏感词检测、定价和扣费；
- 管理后台、用户控制台、Playground、用量看板；
- 默认新版前端和 classic 旧版前端两套主题。

整体可以理解为：

```text
API Client / Dashboard
        |
        v
Gin Router + Auth + Rate Limit
        |
        v
Channel Distributor
        |
        v
Relay Controller
        |
        v
Provider Adaptor
        |
        v
Upstream AI Provider
```

## 2. 技术栈

后端：

- Go module：`github.com/QuantumNous/new-api`
- Go 版本：`go.mod` 声明 `go 1.25.1`，Dockerfile 使用 Go 1.26.1 构建
- Web 框架：Gin
- ORM：GORM v2
- 数据库：SQLite、MySQL、PostgreSQL
- 缓存：Redis 和内存缓存
- 鉴权：Session、JWT / API Token、OAuth、Passkey / WebAuthn、2FA

前端：

- 默认主题：`web/default`，React 19、TypeScript、Rsbuild、TanStack Router、Radix UI、Tailwind CSS
- Classic 主题：`web/classic`，React 18、Vite、Semi Design
- 包管理器：Bun

运维：

- Docker Compose 默认暴露 `3000`
- 可选 Redis、PostgreSQL、MySQL、独立日志库、Pyroscope、pprof

## 3. 关键目录

| 路径 | 作用 |
| --- | --- |
| `main.go` | 程序入口，初始化配置、数据库、Redis、i18n、后台任务和 Gin 路由 |
| `router/` | HTTP 路由定义，分为管理 API、Relay API、视频 API、Web 静态资源 |
| `controller/` | 请求处理器，负责参数校验、业务入口、Relay 总控 |
| `service/` | 业务逻辑层，例如计费、渠道选择、令牌估算、订阅、任务轮询 |
| `model/` | GORM 数据模型、数据库初始化、迁移、缓存查询 |
| `relay/` | AI API 转发核心，按文本、图片、音频、Embedding、Responses、任务等模式处理 |
| `relay/channel/` | 各上游供应商适配器，例如 openai、claude、gemini、aws、ali、ollama |
| `middleware/` | 鉴权、限流、CORS、日志、渠道分发、请求体复用等中间件 |
| `setting/` | 系统配置、模型配置、倍率配置、运营配置、性能配置 |
| `common/` | 通用工具，包含 JSON 包装、Redis、环境变量、日志、缓存、限流 |
| `dto/` | 请求和响应 DTO |
| `constant/` | 渠道类型、上下文 key、任务平台、功能开关等常量 |
| `types/` | Relay 格式、错误、文件源、计费相关类型 |
| `oauth/` | OAuth provider 及自定义 OAuth 逻辑 |
| `pkg/billingexpr/` | 动态计费表达式系统 |
| `web/default/` | 新版前端 |
| `web/classic/` | 旧版前端 |
| `docs/openapi/` | API / Relay OpenAPI 描述文件 |

## 4. 启动流程

`main.go` 的主流程大致如下：

1. `godotenv.Load(".env")` 加载本地环境变量。
2. `common.InitEnv()` 读取端口、日志目录、数据库、Redis、限流、任务、超时等环境配置。
3. 初始化 logger、倍率配置、HTTP client、token encoder。
4. `model.InitDB()` 连接主数据库并执行 GORM 迁移。
5. `model.CheckSetup()` 判断系统是否完成初始化。
6. 初始化 option map、定价、日志数据库、Redis、系统监控、i18n、自定义 OAuth。
7. 启动后台任务：渠道缓存同步、配置同步、额度看板、渠道检测、异步任务轮询、订阅额度重置等。
8. 创建 Gin server，挂载 panic recovery、request id、i18n、日志、session。
9. `router.SetRouter()` 注册所有路由。
10. 监听 `PORT` 或 `--port`，默认 `3000`。

注意：`main.go` 使用 `//go:embed web/default/dist` 和 `//go:embed web/classic/dist`。当前仓库克隆后没有 `dist`，直接 `go run main.go` 可能会因为嵌入目录不存在而编译失败。需要先构建前端，或使用 `Dockerfile.dev` 里的占位 dist 方式。

## 5. 核心请求链路

以 `/v1/chat/completions` 为例：

1. `router/relay-router.go` 把请求挂到 `/v1/chat/completions`。
2. 中间件依次处理 CORS、解压、请求体复用、性能检查、Token 鉴权、模型级限流。
3. `middleware.Distribute()` 从 body 里读取 `model`，结合用户分组、token 限制、渠道状态、优先级和亲和缓存选择一个渠道。
4. `controller.Relay()` 校验请求 DTO，生成 `RelayInfo`。
5. 敏感词检测、token 估算、模型定价、预扣费。
6. 根据请求类型进入 `relay.TextHelper()`、`relay.ImageHelper()`、`relay.AudioHelper()`、`relay.ResponsesHelper()` 等。
7. `relay.GetAdaptor(info.ApiType)` 找到供应商适配器。
8. 适配器执行模型映射、请求转换、参数覆盖、header 构造、上游请求。
9. 读取上游响应，流式或非流式返回给客户端。
10. 根据真实 usage 做后置扣费；失败时退款，必要时收取违规费用。
11. 如果上游失败且满足条件，按 `RetryTimes` 切换渠道重试。

简化流程：

```text
TokenAuth
  -> Distribute
  -> controller.Relay
  -> GetAndValidateRequest
  -> GenRelayInfo
  -> EstimateRequestToken
  -> ModelPriceHelper
  -> PreConsumeBilling
  -> relay.*Helper
  -> provider Adaptor
  -> upstream response
  -> PostConsume / Refund
```

## 6. 主要路由

| 路径 | 说明 |
| --- | --- |
| `/api/setup` | 首次初始化状态和初始化提交 |
| `/api/status` | 服务状态 |
| `/api/user/*` | 登录、注册、用户资料、充值、OAuth 绑定、2FA、Passkey |
| `/api/channel/*` | 渠道管理、测试、余额更新、模型获取、Codex OAuth |
| `/api/token/*` | 用户 API token 管理 |
| `/api/option/*` | Root 系统配置 |
| `/api/subscription/*` | 订阅计划、购买、管理员管理 |
| `/dashboard/billing/*` | 兼容旧版 dashboard billing 接口 |
| `/v1/chat/completions` | OpenAI 兼容聊天补全 |
| `/v1/responses` | OpenAI Responses API |
| `/v1/messages` | Claude Messages 兼容入口 |
| `/v1beta/models/*path` | Gemini 兼容入口 |
| `/v1/images/*` | 图片生成和编辑 |
| `/v1/audio/*` | 音频转写、翻译、TTS |
| `/v1/embeddings` | Embedding |
| `/v1/rerank` | Rerank |
| `/v1/videos*` | OpenAI 风格视频任务 |
| `/mj/*` | Midjourney 任务 |
| `/suno/*` | Suno 任务 |
| `/kling/v1/*` | Kling 视频兼容入口 |
| `/jimeng` | 即梦官方格式兼容入口 |
| `/*` | 前端静态资源和 SPA fallback |

## 7. 本地运行方式

### Docker Compose 快速启动

```bash
docker compose up -d
```

默认访问：

```text
http://localhost:3000
```

首次启动后，如果系统未初始化，会进入初始化向导，创建 Root 用户并选择使用模式。

### 前端开发模式

推荐使用开发 compose 启动后端依赖和后端服务：

```bash
docker compose -f docker-compose.dev.yml up -d
```

然后启动新版前端：

```bash
cd web/default
bun install
bun run dev
```

新版前端 dev server 会把 `/api`、`/mj`、`/pg` 代理到 `http://localhost:3000`。如果要跑 classic：

```bash
cd web/classic
bun install
bun run dev
```

### 本地源码构建

先构建两套前端，再构建后端：

```bash
make build-all-frontends
go build -o new-api
./new-api --port 3000
```

也可以用：

```bash
make all
```

但要注意 `make all` 会先构建前端，再后台启动 `go run main.go`。

## 8. 关键配置

常用配置来自 `.env` 或容器环境变量，`.env.example` 已给出模板。

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口，默认 `3000` |
| `FRONTEND_BASE_URL` | 前端独立部署时，后端将 Web 路由重定向到该地址 |
| `SQL_DSN` | 主数据库 DSN；为空时使用 SQLite |
| `LOG_SQL_DSN` | 日志数据库 DSN；为空时复用主数据库 |
| `SQLITE_PATH` | SQLite 文件路径 |
| `REDIS_CONN_STRING` | Redis 连接串；为空则不启用 Redis |
| `SESSION_SECRET` | Session 加密密钥，生产必须设置随机值，不能是 `random_string` |
| `CRYPTO_SECRET` | 加密密钥；未设置时复用 `SESSION_SECRET` |
| `NODE_TYPE` | 非 `slave` 时视为 master，会执行迁移和部分后台任务 |
| `NODE_NAME` | 节点名，用于审计日志标识 |
| `SYNC_FREQUENCY` | 配置和渠道缓存同步频率，默认 60 秒 |
| `BATCH_UPDATE_ENABLED` | 是否启用批量更新 |
| `UPDATE_TASK` | 是否启用异步任务轮询 |
| `RELAY_TIMEOUT` | Relay 请求总超时，0 表示不限制 |
| `STREAMING_TIMEOUT` | 流式响应空闲超时，默认 300 秒 |
| `FORCE_STREAM_OPTION` | 是否强制流式 usage，默认 true |
| `CountToken` | 是否统计 token，默认 true |
| `TRUSTED_REDIRECT_DOMAINS` | 支付成功或取消跳转的可信域名列表 |

## 9. 数据和后台任务

主要数据表由 `model/main.go` 的 `migrateDB()` 自动迁移，包括：

- `User`：用户、角色、额度、设置；
- `Token`：用户 API token、分组、模型限制；
- `Channel`：上游渠道、类型、密钥、模型映射、分组；
- `Ability`：渠道-模型能力缓存；
- `Log`：请求和扣费日志；
- `Task` / `Midjourney`：异步任务状态；
- `TopUp` / `Redemption`：充值和兑换；
- `SubscriptionPlan` / `UserSubscription` / `SubscriptionOrder`：订阅；
- `Option`：系统配置；
- `Setup`：初始化状态；
- `CustomOAuthProvider` / `UserOAuthBinding`：自定义 OAuth。

后台任务主要在 `main.go` 启动：

- 渠道缓存初始化和周期同步；
- 系统配置周期同步；
- quota data 看板刷新；
- 渠道自动测试和上游模型更新检测；
- Midjourney / 视频等异步任务轮询；
- Codex credential 自动刷新；
- 订阅额度周期重置；
- 可选 pprof 和 Pyroscope。

## 10. 开发约束和易踩点

1. JSON 编解码要优先使用 `common/json.go` 的包装函数，例如 `common.Marshal`、`common.Unmarshal`，业务代码不要直接调用 `encoding/json` 的 marshal / unmarshal。
2. 数据库代码必须同时兼容 SQLite、MySQL、PostgreSQL。优先使用 GORM；写 raw SQL 时要处理列名引用、布尔值和方言差异。
3. 新增可选请求字段，尤其是会转发到上游的 DTO，标量建议使用指针配合 `omitempty`，避免显式 `0` 或 `false` 被误删。
4. 新增渠道时要确认是否支持 `StreamOptions`，支持则加入相关支持列表。
5. 动态计费或分层计费相关变更，先读 `pkg/billingexpr/expr.md`。
6. 前端默认使用 Bun。新版前端改 `web/default`，classic 才改 `web/classic`。
7. 本地直接运行 Go 前，必须保证两个 `dist/index.html` 存在，否则 `//go:embed` 会失败。
8. 多节点部署时，只有 master 节点负责迁移和部分后台任务；`NODE_TYPE=slave` 会跳过这些工作。
9. 生产环境必须修改 Compose 中的默认数据库和 Redis 密码，并设置高强度 `SESSION_SECRET`。

## 11. 测试和质量检查

后端已有 Go 单元测试，分布在 `common/`、`controller/`、`dto/`、`model/`、`relay/`、`service/`、`setting/`、`pkg/billingexpr/` 等目录。常用命令：

```bash
go test ./...
```

新版前端常用命令：

```bash
cd web/default
bun run typecheck
bun run lint
bun run build
```

Classic 前端常用命令：

```bash
cd web/classic
bun run lint
bun run build
```

## 12. 推荐阅读顺序

如果要继续深入，建议按这个顺序看代码：

1. `main.go`：了解启动和初始化。
2. `router/main.go`、`router/relay-router.go`、`router/api-router.go`：了解入口。
3. `middleware/distributor.go`：理解渠道选择。
4. `controller/relay.go`：理解 Relay 总控、计费和重试。
5. `relay/compatible_handler.go`、`relay/responses_handler.go`：理解不同请求模式的处理。
6. `relay/relay_adaptor.go` 和某个具体适配器，例如 `relay/channel/openai/adaptor.go`：理解供应商适配。
7. `service/billing*.go`、`service/pre_consume_quota.go`、`relay/helper/price.go`：理解定价和扣费。
8. `model/main.go`、`model/channel.go`、`model/token.go`、`model/user.go`：理解数据结构。
9. `web/default/src/routes` 和 `web/default/src/features`：理解新版前端页面组织。

