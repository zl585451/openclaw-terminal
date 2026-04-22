#!/bin/bash
echo "Looking for duplicated interfaces..."
find src -type f -name "*.ts" -o -name "*.tsx" | xargs grep -h "interface " | sort | uniq -c | sort -nr | head -n 20
