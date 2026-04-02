#Requires -Version 5.1
[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$headers = @{
    "Authorization" = "Bearer sk-cp-_gYJ8oxI2sN79FhFQBoFSO6HyVM7cruovOJbp-gNpVCh_tYHIe03No2uKJwbVUOVkJNzRaC3HGAe7r62TT2in6vf2CWYkC_UBovxCxRjvmfh_1Q1ChaHxBc"
    "Content-Type" = "application/json; charset=utf-8"
}

$body = '{
    "model": "abab5.5-chat",
    "messages": [
        {
            "role": "system",
            "content": "你叫 AMY，是用户的私人助手。沟通原则：先给结论再细节，带1-3个emoji（😊✅💡），焦虑时先共情，挫败时先肯定。禁止冷冰冰回复（如''好。''''已处理''）。追问时用给2-4个短选项。"
        },
        {
            "role": "user",
            "content": "帮我看看部署问题"
        }
    ]
}'

$response = Invoke-RestMethod -Uri "https://api.minimax.io/v1/text/chat" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json; charset=utf-8"
Write-Output $response.choices[0].message.content