#!/bin/bash
# Fix Node.js PATH for GitHub Actions runner
# Run this script as root on your server

echo "🔧 Fixing Node.js PATH for GitHub Actions runner..."

# Find where Node.js is installed
NODE_PATH=$(which node 2>/dev/null || find /usr/local /usr /opt /root -name node -type f -executable 2>/dev/null | head -1)
NPM_PATH=$(which npm 2>/dev/null || find /usr/local /usr /opt /root -name npm -type f -executable 2>/dev/null | head -1)

if [ -z "$NODE_PATH" ]; then
    echo "❌ Error: Node.js not found"
    exit 1
fi

if [ -z "$NPM_PATH" ]; then
    echo "❌ Error: npm not found"
    exit 1
fi

echo "Found Node.js at: $NODE_PATH"
echo "Found npm at: $NPM_PATH"

# Create symlinks in /usr/local/bin (accessible to all users)
echo "Creating symlinks in /usr/local/bin..."
ln -sf "$NODE_PATH" /usr/local/bin/node
ln -sf "$NPM_PATH" /usr/local/bin/npm

# Verify symlinks
if [ -L /usr/local/bin/node ] && [ -L /usr/local/bin/npm ]; then
    echo "✅ Symlinks created successfully"
    echo ""
    echo "Verifying installation:"
    /usr/local/bin/node --version
    /usr/local/bin/npm --version
    echo ""
    echo "✅ Node.js and npm are now accessible to all users!"
else
    echo "❌ Failed to create symlinks"
    exit 1
fi

