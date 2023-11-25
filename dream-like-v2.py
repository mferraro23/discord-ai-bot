from diffusers import StableDiffusionPipeline
import torch
import sys
from PIL import Image
import os

def main():  # Load the model
    model_id = "dreamlike-art/dreamlike-photoreal-2.0"

    pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
    pipe.safety_checker = None

    pipe = pipe.to("cuda")
    prompt = sys.argv[1]
    neg_prompt = ""
    temp_neg = extract_negative_prompt(prompt)
    if temp_neg is not None:
        neg_prompt = temp_neg
        prompt = prompt.replace(temp_neg, "")

    temp_pos = extract_positive_prompt(prompt)
    if temp_pos is not None:
        prompt = prompt.replace(temp_pos, "")

    # Generate the image
    pipe.max_split_size_mb = 256
    width = 1024
    height = 1024
    image = pipe(
        prompt,
        negative_prompt=neg_prompt,
        width=width,
        height=height,
        num_inference_steps=100,
        guidance_scale=12,
    ).images[0]

    # Upscale the image
    upscale_factor = 4  # You can adjust this factor as needed
    image_upscaled = image.resize(
        (width * upscale_factor, height * upscale_factor), Image.BICUBIC
    )

    # set the filename to the prompt but all the spaces are replaced with underscores 
    prompt = prompt.replace(" ", "_")
    image_filename = prompt[:20] + ".png"
    image_upscaled.save(image_filename)

    # Print the filename to stdout
    print(image_filename)
    print()


def extract_negative_prompt(message):
    prefixes = ["negative:", "neg:", "negative prompt:"]
    for prefix in prefixes:
        if prefix in message.lower():
            start_index = message.lower().find(prefix) + len(prefix)
            end_of_prompt = message[start_index:].lstrip()  # Remove leading whitespaces
            return end_of_prompt
        return None


def extract_positive_prompt(message):
    prefixes = ["positive:", "pos:", "positive prompt:"]
    for prefix in prefixes:
        if prefix in message.lower():
            start_index = message.lower().find(prefix) + len(prefix)
            end_of_prompt = message[start_index:].lstrip()  # Remove leading whitespaces
            return end_of_prompt
        return None


if __name__ == "__main__":
    main()
