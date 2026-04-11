#!/usr/bin/env python3
"""
MiniMax Image Generation Script
Uses image-01 model to generate images from text prompts
"""

import http.client
import json
import base64
import os
from pathlib import Path

# Configuration
API_KEY = "sk-cp-_gYJ8oxI2sN79FhFQBoFSO6HyVM7cruovOJbp-gNpVCh_tYHIe03No2uKJwbVUOVkJNzRaC3HGAe7r62TT2in6vf2CWYkC_UBovxCxRjvmfh_1Q1ChaHxBc"
API_HOST = "api.minimax.chat"
API_URL = "/v1/image_generation"

# The optimized prompt
PROMPT = """A breathtaking Cybertron city nightscape, massive futuristic mechanical towers gleaming with metallic silver and dark steel, flowing with vibrant orange and electric blue energy lines tracing across the architecture, clean and symmetrical composition, dramatic sci-fi atmosphere, deep dark sky with subtle nebula hints, cinematic lighting, highly detailed, 8k ultra high definition"""

def generate_image(prompt: str, output_path: str = "cybertron_wallpaper.png"):
    """Generate image using MiniMax API"""
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "image-01",
        "prompt": prompt,
        "image_size": "1024x1024",  # Default size, can adjust
        "num_images": 1
    }
    
    conn = http.client.HTTPSConnection(API_HOST)
    
    try:
        conn.request("POST", API_URL, body=json.dumps(payload), headers=headers)
        response = conn.getresponse()
        data = json.loads(response.read().decode("utf-8"))
        
        print(f"Response status: {response.status}")
        print(f"Response data: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        if response.status == 200 and data.get("data"):
            # Extract base64 image data
            image_data = data["data"][0].get("b64_json")
            if image_data:
                # Decode and save
                img_bytes = base64.b64decode(image_data)
                with open(output_path, "wb") as f:
                    f.write(img_bytes)
                print(f"Image saved to: {output_path}")
                return output_path
        else:
            print(f"Error: {data.get('base_resp', {}).get('status_msg', 'Unknown error')}")
            return None
            
    except Exception as e:
        print(f"Request failed: {e}")
        return None
    finally:
        conn.close()

if __name__ == "__main__":
    output = generate_image(PROMPT)
    if output:
        print(f"Success! Wallpaper saved to: {output}")
    else:
        print("Generation failed. Check your API key and try again.")
