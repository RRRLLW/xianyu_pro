pipeline {
    agent any
    
    environment {
        // GitHub 私有仓库配置
        GITHUB_REPO = 'https://github.com/zhinianboke/xianyu-auto-reply.git'
        GITHUB_CREDENTIALS = 'github-token'  // 需要在 Jenkins 中配置
        
        // 阿里云镜像仓库配置
        ALIYUN_REGISTRY = 'registry.cn-shanghai.aliyuncs.com'
        ALIYUN_NAMESPACE = 'zhinian-software'
        ALIYUN_CREDENTIALS = 'aliyun-docker-credentials'  // 需要在 Jenkins 中配置
        
        // Docker Hub 配置（备用）
        DOCKERHUB_NAMESPACE = 'zhinianblog'
        DOCKERHUB_CREDENTIALS = 'dockerhub-credentials'
        
        // 镜像名称（单镜像，前后端一体）
        IMAGE_NAME = 'xianyu-auto-reply'
        
        // 支持的平台
        PLATFORMS = 'linux/amd64,linux/arm64'
    }
    
    stages {
        stage('拉取代码') {
            steps {
                echo '开始拉取代码...'
                
                // 配置 Git 使用 HTTP/1.1 避免 HTTP2 问题
                sh 'git config --global http.version HTTP/1.1'
                sh 'git config --global http.postBuffer 524288000'
                
                // 从私有仓库拉取代码（需要凭据）
                git branch: 'main',
                    credentialsId: "${GITHUB_CREDENTIALS}",
                    url: "${GITHUB_REPO}"
                
                echo "代码拉取完成"
            }
        }
        
        stage('验证 Buildx 环境') {
            steps {
                echo '检查 Docker Buildx 环境...'
                script {
                    sh '''
                        # 检查 buildx 是否可用
                        docker buildx version
                        
                        # 确保使用正确的 builder
                        docker buildx use multiarch-builder || \
                        (docker buildx create --name multiarch-builder --driver docker-container --use && \
                         docker buildx inspect --bootstrap)
                        
                        # 显示支持的平台
                        echo "支持的平台:"
                        docker buildx inspect --bootstrap | grep Platforms
                    '''
                }
                echo '✓ Buildx 环境验证通过！'
            }
        }
        
        stage('构建并推送镜像') {
            steps {
                echo "开始构建闲鱼自动回复系统多架构镜像..."
                echo "目标平台: ${PLATFORMS}"
                echo "架构说明: AMD64 (x86_64) + ARM64 (aarch64)"
                script {
                    withCredentials([usernamePassword(
                        credentialsId: "${ALIYUN_CREDENTIALS}",
                        usernameVariable: 'REGISTRY_USER',
                        passwordVariable: 'REGISTRY_PASS'
                    )]) {
                        sh """
                            # 登录阿里云镜像仓库
                            echo "\${REGISTRY_PASS}" | docker login ${ALIYUN_REGISTRY} -u "\${REGISTRY_USER}" --password-stdin
                            
                            # 构建并推送镜像（前后端一体，使用根目录 Dockerfile）
                            docker buildx build \\
                                --platform ${PLATFORMS} \\
                                -t ${ALIYUN_REGISTRY}/${ALIYUN_NAMESPACE}/${IMAGE_NAME}:latest \\
                                -t ${ALIYUN_REGISTRY}/${ALIYUN_NAMESPACE}/${IMAGE_NAME}:build-${BUILD_NUMBER} \\
                                -f Dockerfile \\
                                --push \\
                                .
                            
                            # 登出
                            docker logout ${ALIYUN_REGISTRY}
                        """
                    }
                }
                echo '✓ 镜像推送完成！'
            }
        }
        
        stage('推送到 Docker Hub（备用）') {
            when {
                // 只在主分支推送到 Docker Hub
                branch 'main'
            }
            steps {
                echo "推送镜像到 Docker Hub 作为备用..."
                script {
                    withCredentials([usernamePassword(
                        credentialsId: "${DOCKERHUB_CREDENTIALS}",
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )]) {
                        sh """
                            # 登录 Docker Hub
                            echo "\${DOCKER_PASS}" | docker login -u "\${DOCKER_USER}" --password-stdin
                            
                            # 将阿里云镜像同步到 Docker Hub
                            docker buildx imagetools create \\
                                ${ALIYUN_REGISTRY}/${ALIYUN_NAMESPACE}/${IMAGE_NAME}:latest \\
                                --tag ${DOCKERHUB_NAMESPACE}/${IMAGE_NAME}:latest
                            
                            # 登出
                            docker logout
                        """
                    }
                }
                echo '✓ Docker Hub 备用推送完成！'
            }
        }
        
        stage('生成部署文件') {
            steps {
                echo '生成生产环境部署文件...'
                script {
                    sh """
                        # 创建部署文件目录
                        mkdir -p deploy-artifacts
                        
                        # 复制生产环境配置文件
                        cp docker-compose.yml deploy-artifacts/
                        cp docker-compose-cn.yml deploy-artifacts/
                        cp global_config.yml deploy-artifacts/global_config.yml.template
                        cp entrypoint.sh deploy-artifacts/
                        
                        # 生成 .env 模板文件
                        cat > deploy-artifacts/.env.template << 'ENVEOF'
# ==========================================
# 闲鱼自动回复系统 - 环境变量配置
# ==========================================

# --- 基础配置 ---
WEB_PORT=8080
TZ=Asia/Shanghai
DB_PATH=/app/data/xianyu_data.db
LOG_LEVEL=INFO
DEBUG=false
RELOAD=false

# --- 管理员配置 ---
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET_KEY=请修改为随机字符串
SESSION_TIMEOUT=3600

# --- 多用户系统 ---
MULTIUSER_ENABLED=true
USER_REGISTRATION_ENABLED=true
EMAIL_VERIFICATION_ENABLED=true
CAPTCHA_ENABLED=true
TOKEN_EXPIRE_TIME=86400

# --- 自动发货 ---
AUTO_REPLY_ENABLED=true
AUTO_DELIVERY_ENABLED=true
AUTO_DELIVERY_TIMEOUT=30
API_CARD_TIMEOUT=10
BATCH_DATA_LOCK_TIMEOUT=5

# --- AI回复（可选） ---
AI_REPLY_ENABLED=false
DEFAULT_AI_MODEL=qwen-plus
DEFAULT_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_REQUEST_TIMEOUT=30
AI_MAX_TOKENS=100

# --- WebSocket ---
WEBSOCKET_URL=wss://wss-goofish.dingtalk.com/
HEARTBEAT_INTERVAL=15
HEARTBEAT_TIMEOUT=5
TOKEN_REFRESH_INTERVAL=3600
TOKEN_RETRY_INTERVAL=300
MESSAGE_EXPIRE_TIME=300000

# --- SQL日志 ---
SQL_LOG_ENABLED=true
SQL_LOG_LEVEL=INFO

# --- 资源限制 ---
MEMORY_LIMIT=2048
CPU_LIMIT=2.0
MEMORY_RESERVATION=512
CPU_RESERVATION=0.5
ENVEOF

                        # 生成生产环境 docker-compose 文件（使用阿里云镜像）
                        cat > deploy-artifacts/docker-compose.prod.yml << 'COMPEOF'
services:
  xianyu-app:
    image: registry.cn-shanghai.aliyuncs.com/zhinian-software/xianyu-auto-reply:latest
    container_name: xianyu-auto-reply
    restart: unless-stopped
    user: "0:0"
    ports:
      - "\${WEB_PORT:-8080}:8080"
    volumes:
      - ./data:/app/data:rw
      - ./logs:/app/logs:rw
      - ./global_config.yml:/app/global_config.yml:ro
      - ./backups:/app/backups:rw
    env_file:
      - .env
    networks:
      - xianyu-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: \${MEMORY_LIMIT:-2048}M
          cpus: '\${CPU_LIMIT:-2.0}'
        reservations:
          memory: \${MEMORY_RESERVATION:-512}M
          cpus: '\${CPU_RESERVATION:-0.5}'

networks:
  xianyu-network:
    driver: bridge
COMPEOF

                        # 创建部署脚本
                        cat > deploy-artifacts/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
# 闲鱼自动回复系统 - 一键部署脚本
#
# 使用方法:
# 1. 上传部署文件到服务器
# 2. 配置 .env 文件
# 3. 运行: bash deploy.sh

set -e

echo "=========================================="
echo "  闲鱼自动回复系统 - 部署脚本"
echo "=========================================="

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "未找到 .env 文件，从模板创建..."
    if [ -f ".env.template" ]; then
        cp .env.template .env
        echo "已创建 .env 文件，请先修改配置后重新运行此脚本"
        echo "  vim .env"
        exit 1
    else
        echo "错误: 未找到 .env 和 .env.template 文件"
        exit 1
    fi
fi

# 检查配置文件
if [ ! -f "global_config.yml" ]; then
    if [ -f "global_config.yml.template" ]; then
        cp global_config.yml.template global_config.yml
        echo "已从模板创建 global_config.yml"
    else
        echo "警告: 未找到 global_config.yml，将使用容器内默认配置"
    fi
fi

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo "错误: 未安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "错误: 未安装 Docker Compose"
    exit 1
fi

# 停止并删除旧容器和镜像
echo "清理旧容器和镜像..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
docker rmi registry.cn-shanghai.aliyuncs.com/zhinian-software/xianyu-auto-reply:latest 2>/dev/null || true
echo "旧容器和镜像已清理"

# 创建必要的目录
echo "创建数据目录..."
mkdir -p data logs backups
echo "目录创建完成"

# 拉取最新镜像
echo "拉取最新镜像..."
docker-compose -f docker-compose.prod.yml pull

# 启动服务
echo "启动服务..."
docker-compose -f docker-compose.prod.yml up -d

# 检查服务状态
echo "等待服务启动..."
sleep 15
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo "访问地址: http://localhost:${WEB_PORT:-8080}"
echo "=========================================="
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose -f docker-compose.prod.yml logs -f"
echo "  重启服务: docker-compose -f docker-compose.prod.yml restart"
echo "  停止服务: docker-compose -f docker-compose.prod.yml down"
echo "  更新服务: bash update.sh"
echo "=========================================="
DEPLOYEOF

                        # 创建更新脚本
                        cat > deploy-artifacts/update.sh << 'UPDATEEOF'
#!/bin/bash
# 闲鱼自动回复系统 - 一键更新脚本

set -e

echo "=========================================="
echo "  闲鱼自动回复系统 - 更新脚本"
echo "=========================================="

# 停止旧容器
echo "停止旧容器..."
docker-compose -f docker-compose.prod.yml down

# 删除旧镜像
echo "删除旧镜像..."
docker rmi registry.cn-shanghai.aliyuncs.com/zhinian-software/xianyu-auto-reply:latest 2>/dev/null || true

# 拉取最新镜像
echo "拉取最新镜像..."
docker-compose -f docker-compose.prod.yml pull

# 启动服务
echo "启动服务..."
docker-compose -f docker-compose.prod.yml up -d

# 检查服务状态
echo "等待服务启动..."
sleep 15
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "更新完成！"
echo "访问地址: http://localhost:${WEB_PORT:-8080}"
UPDATEEOF

                        # 设置脚本执行权限
                        chmod +x deploy-artifacts/*.sh
                        
                        # 创建 README
                        cat > deploy-artifacts/README.md << 'READMEEOF'
# 闲鱼自动回复系统 - 部署文件

## 文件说明

- `docker-compose.prod.yml`: 生产环境 Docker Compose 配置（使用阿里云镜像）
- `docker-compose.yml`: 本地构建版 Docker Compose 配置
- `docker-compose-cn.yml`: 国内源本地构建版配置
- `.env.template`: 环境变量模板文件
- `global_config.yml.template`: 全局配置模板文件
- `deploy.sh`: 一键部署脚本（自动清理旧容器和镜像）
- `update.sh`: 一键更新脚本（自动清理旧镜像并拉取最新版）

## 部署步骤

1. **上传文件到服务器**
   ```bash
   scp -r deploy-artifacts/* root@your-server:/opt/xianyu-auto-reply/
   ```

2. **登录服务器并进入目录**
   ```bash
   ssh root@your-server
   cd /opt/xianyu-auto-reply
   ```

3. **配置环境变量**
   ```bash
   cp .env.template .env
   vim .env  # 修改管理员密码、JWT密钥等
   ```

4. **配置全局参数（可选）**
   ```bash
   cp global_config.yml.template global_config.yml
   vim global_config.yml
   ```

5. **一键部署**
   ```bash
   bash deploy.sh
   ```

## 服务管理

- **查看状态**: `docker-compose -f docker-compose.prod.yml ps`
- **查看日志**: `docker-compose -f docker-compose.prod.yml logs -f`
- **重启服务**: `docker-compose -f docker-compose.prod.yml restart`
- **停止服务**: `docker-compose -f docker-compose.prod.yml down`
- **更新服务**: `bash update.sh`

## 访问地址

- 系统入口: http://localhost:8080

## 镜像信息

- 镜像: `registry.cn-shanghai.aliyuncs.com/zhinian-software/xianyu-auto-reply:latest`
- 备用: `zhinianblog/xianyu-auto-reply:latest`（Docker Hub）

## 数据持久化

以下目录会挂载到宿主机，数据不会因容器重启丢失：
- `./data/` - SQLite数据库
- `./logs/` - 日志文件
- `./backups/` - 数据库备份
- `./global_config.yml` - 全局配置

READMEEOF
                        
                        echo "部署文件生成完成！"
                        ls -la deploy-artifacts/
                    """
                }
                
                // 归档部署文件
                archiveArtifacts artifacts: 'deploy-artifacts/**', 
                                 fingerprint: true,
                                 allowEmptyArchive: false
                
                echo '✓ 部署文件生成完成！'
            }
        }
        
        stage('清理 Builder 缓存') {
            steps {
                echo '清理 buildx 缓存...'
                sh """
                    # 清理构建缓存（保留10GB）
                    docker buildx prune -f --keep-storage 10GB || true
                """
                echo '✓ 清理完成！'
            }
        }
    }
    
    post {
        success {
            echo """
            ========================================
            闲鱼自动回复系统 构建成功！
            ========================================
            构建编号：${BUILD_NUMBER}
            支持平台：${PLATFORMS}
            
            镜像已推送到阿里云镜像仓库：
            ────────────────────────────────────────
            镜像地址:
              ${ALIYUN_REGISTRY}/${ALIYUN_NAMESPACE}/${IMAGE_NAME}:latest
              ${ALIYUN_REGISTRY}/${ALIYUN_NAMESPACE}/${IMAGE_NAME}:build-${BUILD_NUMBER}
            
            支持的架构：
              linux/amd64  (x86_64 - Intel/AMD 处理器)
              linux/arm64  (aarch64 - ARM 64位处理器)
            
            部署文件已生成：
            ────────────────────────────────────────
              docker-compose.prod.yml (生产环境配置)
              .env.template (环境变量模板)
              global_config.yml.template (全局配置模板)
              deploy.sh (一键部署脚本)
              update.sh (一键更新脚本)
              README.md (部署说明)
              
              下载方式：
              1. 打开此构建页面
              2. 点击左侧 "Build Artifacts"
              3. 下载 deploy-artifacts 文件夹
              
              或使用命令行：
              wget ${BUILD_URL}artifact/deploy-artifacts.zip
            
            ========================================
            部署方法：
            ========================================
            
            【快速部署】:
              1. 下载部署文件到服务器
              2. 配置 .env 文件
              3. 运行: bash deploy.sh
            
            【手动部署】:
              1. 拉取镜像:
                 docker pull ${ALIYUN_REGISTRY}/${ALIYUN_NAMESPACE}/${IMAGE_NAME}:latest
              
              2. 启动服务:
                 docker-compose -f docker-compose.prod.yml up -d
            
            适用设备：
              x86_64 服务器 (Intel/AMD)
              ARM64 服务器 (AWS Graviton, 华为鲲鹏等)
              树莓派 4/5 (64位系统)
              苹果 M1/M2/M3 Mac (通过 Docker Desktop)
            
            ========================================
            访问地址：
            ========================================
              系统入口: http://localhost:8080
            ========================================
            """
        }
        failure {
            echo """
            ========================================
            闲鱼自动回复系统 构建失败！
            ========================================
            可能的原因：
            1. GitHub 凭据配置错误
            2. 阿里云镜像仓库凭据配置错误
            3. buildx 未正确配置
            4. 目标平台不支持
            5. Dockerfile 不兼容多架构
            6. 前端构建失败（pnpm install 或 pnpm build）
            7. Python 依赖安装失败
            8. Playwright 浏览器安装失败
            9. 网络连接问题
            
            解决方案：
            1. 检查 GitHub 凭据: Jenkins -> 凭据管理 -> github-token
            2. 检查阿里云凭据: Jenkins -> 凭据管理 -> aliyun-registry-credentials
            3. 检查 buildx 配置: docker buildx ls
            4. 查看详细构建日志
            5. 验证 Dockerfile 是否支持多架构
            6. 检查前端 pnpm-lock.yaml 是否最新
            7. 检查 requirements.txt 依赖是否兼容
            ========================================
            """
        }
        always {
            echo '闲鱼自动回复系统 构建流程结束。'
        }
    }
}
