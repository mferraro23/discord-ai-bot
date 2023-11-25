import torch
import sys
import os
from diffusers import StableDiffusionImageVariationPipeline
from PIL import Image, UnidentifiedImageError
from torchvision import transforms
from PIL import Image
import requests
from io import BytesIO
from torchvision.transforms.functional import to_pil_image

def main():
    pipe = StableDiffusionImageVariationPipeline.from_pretrained(
        "lambdalabs/sd-image-variations-diffusers",
        revision="v2.0",
    )
    pipe.max_split_size_mb = 256
    pipe.safety_checker = None
    pipe.to("cuda")

    image_path_or_url = sys.argv[1]
    prompt = sys.argv[2]

    # Load the image from a URL or local path
    if image_path_or_url.startswith("http://") or image_path_or_url.startswith(
        "https://"
    ):
        response = requests.get(image_path_or_url)
        image = Image.open(BytesIO(response.content))
    else:
        image = Image.open(image_path_or_url)

    try:
        torch.cuda.empty_cache()
        if image.mode != "RGB":
            image = image.convert("RGB")
        # Generate the image
        tform = transforms.Compose(
            [
                transforms.ToTensor(),
                transforms.Resize(
                    (224, 224),
                    interpolation=transforms.InterpolationMode.BICUBIC,
                    antialias=False,
                ),
                transforms.Normalize(
                    [0.48145466, 0.4578275, 0.40821073],
                    [0.26862954, 0.26130258, 0.27577711],
                ),
            ]
        )
        inp = tform(image).to("cuda").unsqueeze(0)
        result = pipe(inp, width=1024, height=1024, guidance_scale=1)

        # Convert the tensor to a PIL Image
        generated_image = result.images[0]

        # Save the image
        image_filename = "regen_image.png"
        generated_image.save(image_filename)
        print(image_filename)

    except RuntimeError as e:
        if "out of memory" in str(e):
            print("CUDA Out of Memory error: ", e)
            torch.cuda.empty_cache()
        else:
            raise e
    finally:
        torch.cuda.empty_cache()


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
