import sys
import torch
from diffusers import StableDiffusionXLInpaintPipeline
from diffusers.utils import load_image
from PIL import Image


def main():
    # Load the pipeline
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    )
    pipe.max_split_size_mb = 256
    pipe.safety_checker = None
    pipe.use_karras_sigmas = True
    # pipe.to("cuda")
    pipe.enable_model_cpu_offload()

    # Load your image
    url = sys.argv[1]
    init_image = load_image(url).convert("RGB")
    resized_image = resize_image(init_image, 0.25)
    mask_image = sys.argv[2]
    init_mask_image = load_image(mask_image).convert("RGB")

    # Specify your text prompt
    prompt = sys.argv[3]

    # Run the pipeline
    image = pipe(
        prompt=prompt,
        num_images_per_prompt=1,
        image=resized_image,
        mask_image=init_mask_image,
        negative_prompt="bad quality",
    ).images
   
    image.save("better-edit.png")


def resize_image(image, scale_factor):
    # Calculate new dimensions
    new_width = int(image.width * scale_factor)
    new_height = int(image.height * scale_factor)

    # Resize the image
    resized_img = image.resize((new_width, new_height), Image.ANTIALIAS)
    return resized_img


if __name__ == "__main__":
    main()
