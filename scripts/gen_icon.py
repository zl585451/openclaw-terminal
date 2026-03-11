from PIL import Image
img = Image.open('assets/oct_icon.png').convert('RGBA')
sizes = [16, 32, 48, 64, 128, 256]
icons = [img.resize((s, s), Image.LANCZOS) for s in sizes]
# electron-builder 要求主图为 256x256，将最大尺寸放第一位
icons[-1].save('assets/icon.ico', format='ICO', sizes=[(s, s) for s in sizes], append_images=icons[:-1])
print('done')
