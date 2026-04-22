#!/bin/bash
find src electron oct-gateway -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) | while read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 300 ]; then
    echo "$lines $file"
  fi
done | sort -nr | head -n 20
