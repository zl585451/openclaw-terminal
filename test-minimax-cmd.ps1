$headers = @{
    "Authorization" = "Bearer sk-cp-_gYJ8oxI2sN79FhFQBoFSO6HyVM7cruovOJbp-gNpVCh_tYHIe03No2uKJwbVUOVkJNzRaC3HGAe7r62TT2in6vf2CWYkC_UBovxCxRjvmfh_1Q1ChaHxBc"
    "Content-Type" = "application/json"
}

# 使用 Here-String 避免引号转义问题
$body = @"
{
    "model": "abab5.5-chat",
    "messages": [
        {
            "role": "system",
            "content": "You are AMY, a helpful assistant. Respond concisely with key points first, then details. Use 1-3 emojis (😊✅💡). Show empathy when user is frustrated."
        },
        {
            "role": "user",
            "content": "Help me check deployment issues"
        }
    ]
}
"@

$response = Invoke-RestMethod -Uri "https://api.minimax.io/v1/text/chat" -Method Post -Headers $headers -Body $body
Write-Output $response.choices[0].message.content