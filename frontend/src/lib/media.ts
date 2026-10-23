import { validateImage } from "./validation";

// Data URLs survive a refresh in the UI-only store; blob URLs do not.
export async function readPreviewImage(file: File): Promise<string> {
  const error = validateImage(file);
  if (error) throw new Error(error);
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read this image. Please try again."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Couldn't read this image."));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = source;
  await image.decode().catch(() => {
    throw new Error("This image couldn't be opened. Try another file.");
  });
  const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image previews aren't available in this browser.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}
