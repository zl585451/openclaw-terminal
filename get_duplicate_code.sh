#!/bin/bash
# A simple heuristic to find repeating blocks of code (mostly config structures)
grep -C 2 "model: " src/ui/settings/tabs/ConnectionTabView.Beginner.tsx src/ui/settings/tabs/ConnectionTabView.tsx src/hooks/settings/recommendedModels.ts
