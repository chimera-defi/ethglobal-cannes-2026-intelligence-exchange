#!/bin/bash
# Quick security check script
echo "🔍 Running Security Checks"
echo "=========================="

# Check 1: Verify no default passwords in docker-compose
echo ""
echo "📍 Check 1: Default passwords in docker-compose"
if grep -q "iex_local_dev_only_change_me\|iex_redis_local_dev_only_change_me" docker-compose.yml; then
  echo "❌ FAIL: Default passwords found in docker-compose.yml"
else
  echo "✅ PASS: No default passwords in docker-compose.yml"
fi

# Check 2: Verify no hardcoded private keys
echo ""
echo "📍 Check 2: Hardcoded private keys in source"
if grep -r "0x59c6995e998f97a5a0044976f5d6f5f45e26d4e9f8f6b0c27a8c34f6f14e4a72" apps/intelligence-exchange-cannes-broker/src --include="*.ts"; then
  echo "❌ FAIL: Hardcoded Anvil private key found in source"
else
  echo "✅ PASS: No hardcoded private keys in source"
fi

# Check 3: Verify network isolation exists
echo ""
echo "📍 Check 3: Network isolation in docker-compose"
if grep -q "networks:" docker-compose.yml; then
  echo "✅ PASS: Network isolation configured"
else
  echo "❌ FAIL: No network isolation found"
fi

# Check 4: Verify container security options
echo ""
echo "📍 Check 4: Container security options"
if grep -q "no-new-privileges" docker-compose.yml; then
  echo "✅ PASS: Container security options present"
else
  echo "❌ FAIL: No container security options"
fi

# Check 5: Verify Redis memory limits
echo ""
echo "📍 Check 5: Redis memory limits"
if grep -q "maxmemory" docker-compose.yml; then
  echo "✅ PASS: Redis memory limits configured"
else
  echo "❌ FAIL: No Redis memory limits"
fi

# Check 6: Verify SSL configuration available
echo ""
echo "📍 Check 6: SSL configuration"
if [ -f "docker-compose.ssl.yml" ]; then
  echo "✅ PASS: SSL configuration file exists"
else
  echo "❌ FAIL: No SSL configuration file"
fi

# Check 7: Verify dependency overrides
echo ""
echo "📍 Check 7: Dependency security overrides"
if grep -q '"ws":' package.json && grep -q '"uuid":' package.json; then
  echo "✅ PASS: Dependency security overrides present"
else
  echo "❌ FAIL: No dependency security overrides"
fi

# Check 8: Verify .env files not committed
echo ""
echo "📍 Check 8: No .env files committed"
if git ls-files | grep -q "\.env$"; then
  echo "❌ FAIL: .env files committed to git"
else
  echo "✅ PASS: No .env files committed"
fi

echo ""
echo "=========================="
echo "Security check complete"