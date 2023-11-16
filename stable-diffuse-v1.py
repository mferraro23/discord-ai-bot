from diffusers import StableDiffusionPipeline
import torch
import sys

model_id = "runwayml/stable-diffusion-v1-5"
#model_id = "dreamlike-art/dreamlike-photoreal-2.0"

pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
pipe.safety_checker = None
pipe.sampler = "dpm++_sde_karras"


pipe = pipe.to("cuda")
prompt = sys.argv[1]
pipe.max_split_size_mb = 256
width = 512
height = 512
image = pipe(prompt, negative_prompt="EasyNegative,DeepNegative,extra digit,fewer digits,head out of frame,long neck, multiple bodys, multiple heads, multiple people, multiple legs, conjoined people, weird faces, multiple faces, disjointed limbs, multiple limbs, multiple feet, multiple hands", width=width,height=height,num_inference_steps=110,guidance_scale=12).images[0]
image_filename = "output.png"
image.save(image_filename)

# Print the filename to stdout
print(image_filename)
