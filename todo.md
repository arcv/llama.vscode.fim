curl -s http://192.168.1.101:8012/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "def foo():\n    ",
    "suffix": "\n    return result",
    "max_tokens": 20
  }' | jq .
