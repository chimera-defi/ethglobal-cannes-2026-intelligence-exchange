#!/bin/bash
# Generate secrets for production environment
# Run this script to generate secure random values for your .env file

echo 'Generated secrets — paste into your .env:'
echo ''
echo 'ADMIN_API_KEY='$(openssl rand -hex 32)