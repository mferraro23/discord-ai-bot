import tensorflow as tf
import tensorflow_hub as hub
import matplotlib.pyplot as plt
from PIL import Image
import numpy as np

# Disable eager execution
tf.compat.v1.disable_eager_execution()

# Load BigGAN 512 module.
module = hub.Module('https://tfhub.dev/deepmind/biggan-512/2')

# Sample random noise (z) and ImageNet label (y) inputs.
batch_size = 1
truncation = 0.5 # scalar truncation value in [0.02, 1.0]
z = truncation * tf.random.truncated_normal([batch_size, 128]) # noise sample
y_index = tf.random.uniform([batch_size], maxval=1000, dtype=tf.int32)
y = tf.one_hot(y_index, 1000) # one-hot ImageNet label

# Call BigGAN on a dict of the inputs to generate a batch of images with shape
# [8, 512, 512, 3] and range [-1, 1].
samples = module(dict(y=y, z=z, truncation=truncation))

with tf.compat.v1.Session() as sess:
    sess.run(tf.compat.v1.global_variables_initializer())
    images = sess.run(samples)

# Normalize the images to [0, 1] range from [-1, 1] for display
images = (images + 1) / 2

filenames = []
# Loop over the images and display them
for i, image in enumerate(images):
    # Convert the image data to a PIL Image
    im = Image.fromarray((image * 255).astype(np.uint8))
    filename = f"image_{i+1}.png"
    # Save the filename
    filenames.append(filename)
    # Save the image
    im.save(filename)
    
for filename in filenames:
    print(filename)
