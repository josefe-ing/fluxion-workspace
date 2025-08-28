# Fluxion AI - Makefile Principal
# =============================================

# Variables
CLIENT ?= la-granja
TYPE ?= executive
PORT_BACKEND ?= 3000
PORT_FRONTEND ?= 3001
PORT_DEMO ?= 8080

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

.PHONY: help
help: ## Show this help message
	@echo "$(BLUE)╔════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║           FLUXION AI - Development & Demo System        ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(GREEN)Demo commands:$(NC)"
	@echo "  $(YELLOW)demo$(NC)                 Start demo (use CLIENT=name TYPE=quick|executive|full)"
	@echo "  $(YELLOW)demo-quick$(NC)           Quick 5-min demo"
	@echo "  $(YELLOW)demo-executive$(NC)       Executive 20-min demo"
	@echo "  $(YELLOW)demo-full$(NC)            Full technical demo"
	@echo ""
	@echo "$(GREEN)Examples:$(NC)"
	@echo "  make demo CLIENT=la-granja TYPE=executive"
	@echo "  make new-demo CLIENT=farmacia-central"
	@echo "  make dev"

# =============================================
# Setup & Installation
# =============================================

.PHONY: setup
setup: ## Initial setup of the workspace
	@echo "$(GREEN)🚀 Setting up Fluxion Workspace...$(NC)"
	@./scripts/setup.sh
	@echo "$(GREEN)✅ Setup complete!$(NC)"

.PHONY: install
install: ## Install all dependencies
	@echo "$(GREEN)📦 Installing dependencies...$(NC)"
	@cd services/backend && npm install
	@cd services/frontend && npm install
	@echo "$(GREEN)✅ Dependencies installed!$(NC)"

# =============================================
# Development
# =============================================

.PHONY: dev
dev: ## Start development environment (native)
	@echo "$(GREEN)🚀 Starting Development Environment...$(NC)"
	@./scripts/start-dev.sh

.PHONY: dev-docker
dev-docker: ## Start development with Docker
	@echo "$(GREEN)🐳 Starting Docker Development...$(NC)"
	@docker-compose up -d
	@echo "$(GREEN)✅ Services running in Docker$(NC)"
	@echo "📊 Backend: http://localhost:$(PORT_BACKEND)"
	@echo "🎨 Frontend: http://localhost:$(PORT_FRONTEND)"

.PHONY: stop
stop: ## Stop all services
	@echo "$(RED)⏹️  Stopping all services...$(NC)"
	@docker-compose down 2>/dev/null || true
	@pkill -f "node.*backend" 2>/dev/null || true
	@pkill -f "node.*frontend" 2>/dev/null || true
	@pkill -f "python.*demo" 2>/dev/null || true
	@echo "$(GREEN)✅ All services stopped$(NC)"

.PHONY: logs
logs: ## Show logs from all services
	@docker-compose logs -f

.PHONY: clean
clean: ## Clean everything (containers, volumes, node_modules)
	@echo "$(RED)🧹 Cleaning everything...$(NC)"
	@docker-compose down -v 2>/dev/null || true
	@rm -rf services/*/node_modules
	@rm -rf services/*/dist
	@rm -rf .fluxion/*.pid
	@echo "$(GREEN)✅ Clean complete$(NC)"

# =============================================
# Demo System
# =============================================

.PHONY: demo
demo: ## Start demo for specific client (CLIENT=name TYPE=quick|executive|full)
	@echo "$(BLUE)🎪 Starting Demo for $(CLIENT)...$(NC)"
	@./scripts/demo-launcher.sh $(CLIENT) $(TYPE)

.PHONY: demo-quick
demo-quick: ## Quick 5-minute demo
	@echo "$(BLUE)⚡ Quick Demo Mode$(NC)"
	@cd demos/clients/$(CLIENT) && \
		python3 -m http.server $(PORT_DEMO) --directory ../../templates/dashboard-standalone

.PHONY: demo-executive
demo-executive: ## Executive 20-minute demo
	@echo "$(BLUE)💼 Executive Demo Mode$(NC)"
	@cd services/backend && node src/demo-api-server.cjs &
	@cd demos/templates/dashboard-standalone && npm run dev

.PHONY: demo-full
demo-full: ## Full technical demo with all features
	@echo "$(BLUE)🔧 Full Technical Demo$(NC)"
	@docker-compose -f docker-compose.demo.yml up

.PHONY: new-demo
new-demo: ## Create new client demo (CLIENT=name)
	@echo "$(GREEN)📝 Creating demo for $(CLIENT)...$(NC)"
	@mkdir -p demos/clients/$(CLIENT)
	@cp -r demos/clients/_template/* demos/clients/$(CLIENT)/
	@echo "$(GREEN)✅ Demo created at demos/clients/$(CLIENT)$(NC)"
	@echo "$(YELLOW)📝 Edit demos/clients/$(CLIENT)/config.json to customize$(NC)"

.PHONY: list-demos
list-demos: ## List all available demos
	@echo "$(BLUE)📋 Available Client Demos:$(NC)"
	@ls -1 demos/clients/ | grep -v _template | sed 's/^/  • /'

.PHONY: demo-save
demo-save: ## Save current demo state
	@echo "$(GREEN)💾 Saving demo state for $(CLIENT)...$(NC)"
	@mkdir -p demos/clients/$(CLIENT)/saves
	@cp demos/clients/$(CLIENT)/data.json demos/clients/$(CLIENT)/saves/data-$$(date +%Y%m%d-%H%M%S).json
	@echo "$(GREEN)✅ Demo state saved$(NC)"

.PHONY: demo-reset
demo-reset: ## Reset demo to default state
	@echo "$(YELLOW)🔄 Resetting demo for $(CLIENT)...$(NC)"
	@cp demos/clients/_template/data.json demos/clients/$(CLIENT)/data.json
	@echo "$(GREEN)✅ Demo reset complete$(NC)"

# =============================================
# Git & Sync
# =============================================

.PHONY: sync
sync: ## Sync all repos with GitHub
	@echo "$(GREEN)📤 Syncing all repositories...$(NC)"
	@./scripts/sync-repos.sh

.PHONY: status
status: ## Show git status for all repos
	@echo "$(BLUE)📊 Git Status:$(NC)"
	@echo "$(YELLOW)Workspace:$(NC)"
	@git status -s
	@echo "$(YELLOW)Backend:$(NC)"
	@cd services/backend && git status -s
	@echo "$(YELLOW)Frontend:$(NC)"
	@cd services/frontend && git status -s

.PHONY: pull
pull: ## Pull latest from all repos
	@echo "$(GREEN)📥 Pulling latest changes...$(NC)"
	@git pull
	@cd services/backend && git pull
	@cd services/frontend && git pull
	@cd services/ai-engine && git pull
	@cd services/infrastructure && git pull

# =============================================
# Testing
# =============================================

.PHONY: test
test: ## Run all tests
	@echo "$(GREEN)🧪 Running tests...$(NC)"
	@cd services/backend && npm test
	@cd services/frontend && npm test

.PHONY: test-api
test-api: ## Test API endpoints
	@echo "$(GREEN)🔌 Testing API...$(NC)"
	@curl -s http://localhost:$(PORT_BACKEND)/health | jq .

# =============================================
# Docker Commands
# =============================================

.PHONY: docker-build
docker-build: ## Build all Docker images
	@echo "$(GREEN)🏗️  Building Docker images...$(NC)"
	@docker-compose build

.PHONY: docker-push
docker-push: ## Push images to registry
	@echo "$(GREEN)📤 Pushing to registry...$(NC)"
	@docker-compose push

# =============================================
# Utility Commands
# =============================================

.PHONY: ports
ports: ## Show which ports are in use
	@echo "$(BLUE)🔌 Ports in use:$(NC)"
	@lsof -i :3000 -i :3001 -i :8080 -i :5432 -i :6379 2>/dev/null | grep LISTEN || echo "  No services running"

.PHONY: kill-ports
kill-ports: ## Kill processes on common ports
	@echo "$(RED)💀 Killing processes on ports...$(NC)"
	@lsof -ti :3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti :3001 | xargs kill -9 2>/dev/null || true
	@lsof -ti :8080 | xargs kill -9 2>/dev/null || true
	@echo "$(GREEN)✅ Ports cleared$(NC)"

.PHONY: backup
backup: ## Backup all data and configs
	@echo "$(GREEN)💾 Creating backup...$(NC)"
	@tar -czf backups/fluxion-backup-$$(date +%Y%m%d-%H%M%S).tar.gz \
		demos/clients \
		services/*/src \
		docs
	@echo "$(GREEN)✅ Backup created in backups/$(NC)"

# =============================================
# Production
# =============================================

.PHONY: deploy
deploy: ## Deploy to production
	@echo "$(RED)🚀 Deploying to production...$(NC)"
	@./scripts/deploy.sh

.PHONY: rollback
rollback: ## Rollback to previous version
	@echo "$(YELLOW)⏮️  Rolling back...$(NC)"
	@./scripts/rollback.sh

# Default target
.DEFAULT_GOAL := help