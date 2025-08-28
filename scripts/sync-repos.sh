#!/bin/bash

# Fluxion AI - Repository Sync
# =============================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            FLUXION AI - Repository Sync                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to sync a repository
sync_repo() {
    local service=$1
    local repo_path="services/$service"
    
    echo -e "${YELLOW}📂 Syncing $service...${NC}"
    
    if [ ! -d "$repo_path" ]; then
        echo -e "${RED}  ❌ Directory not found: $repo_path${NC}"
        return
    fi
    
    cd "$repo_path"
    
    # Check if it's a git repository
    if [ ! -d ".git" ]; then
        echo -e "${RED}  ❌ Not a git repository${NC}"
        cd ../..
        return
    fi
    
    # Check for changes
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${GREEN}  📝 Changes detected${NC}"
        
        # Add all changes
        git add .
        
        # Commit with timestamp
        COMMIT_MSG="Update from workspace - $(date '+%Y-%m-%d %H:%M')"
        git commit -m "$COMMIT_MSG"
        echo -e "${GREEN}  ✅ Committed: $COMMIT_MSG${NC}"
        
        # Push to origin
        git push origin main || git push origin master
        echo -e "${GREEN}  📤 Pushed to GitHub${NC}"
    else
        echo -e "${BLUE}  ⏭️  No changes to sync${NC}"
    fi
    
    cd ../..
}

# Sync each service
echo -e "${GREEN}🔄 Syncing services...${NC}"
sync_repo "backend"
sync_repo "frontend"
sync_repo "ai-engine"
sync_repo "infrastructure"

# Sync workspace repository
echo -e "${YELLOW}📂 Syncing workspace...${NC}"
if [ -n "$(git status --porcelain)" ]; then
    git add .
    git commit -m "Workspace update - $(date '+%Y-%m-%d %H:%M')"
    git push origin main 2>/dev/null || echo -e "${YELLOW}  ⚠️  No remote configured for workspace${NC}"
    echo -e "${GREEN}  ✅ Workspace synced${NC}"
else
    echo -e "${BLUE}  ⏭️  No changes in workspace${NC}"
fi

echo ""
echo -e "${GREEN}✅ All repositories synchronized!${NC}"
echo ""

# Show summary
echo -e "${BLUE}📊 Summary:${NC}"
for service in backend frontend ai-engine infrastructure; do
    if [ -d "services/$service/.git" ]; then
        cd "services/$service"
        BRANCH=$(git branch --show-current)
        COMMITS_AHEAD=$(git rev-list --count origin/$BRANCH..$BRANCH 2>/dev/null || echo "0")
        COMMITS_BEHIND=$(git rev-list --count $BRANCH..origin/$BRANCH 2>/dev/null || echo "0")
        echo -e "  • $service: branch=$BRANCH, ahead=$COMMITS_AHEAD, behind=$COMMITS_BEHIND"
        cd ../..
    fi
done