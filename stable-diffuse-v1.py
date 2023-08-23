from diffusers import StableDiffusionPipeline
import torch
import sys

model_id = "runwayml/stable-diffusion-v1-5"

pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
pipe.safety_checker = None

pipe = pipe.to("cuda")
prompt = sys.argv[1]
pipe.max_split_size_mb = 256

neg_p = "low resolution, blurry, mishapen face, blurry, bad quality, bad render, not realistic, bad anatomy, blurry, fuzzy, disfigured, misshaped, mutant, mutated, deformed, bad art, out of frame, poor quality, not good"

image = pipe(prompt,negative_prompt=neg_p, width=640,height=768,num_inference_steps=125,guidance_scale=12).images[0]
image_filename = "output.png"
image.save(image_filename)

# Print the filename to stdout
print(image_filename)
