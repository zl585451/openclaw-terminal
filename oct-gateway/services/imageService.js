class ImageService {
  constructor({ imageAnalyzer, getImageAnalyzer, logger }) {
    this.imageAnalyzer = imageAnalyzer;
    this.getImageAnalyzer = getImageAnalyzer;
    this.log = logger;
  }

  async processImageAttachments(userMessage, imageAttachments, currentModel, providerConfig) {
    const textPart = userMessage || '请分析这张图片';
    const currentModelDef = providerConfig.models.find((model) => model.id === currentModel);
    const supportsInlineVision =
      currentModelDef?.vision === true
      || /(?:^|[-_/])vl(?:[-_/]|$)/i.test(currentModel)
      || /vision/i.test(currentModel);

    this.log.info('image request routing', {
      model: currentModel,
      provider: providerConfig.name,
      imageCount: imageAttachments.length,
      supportsInlineVision,
      route: supportsInlineVision ? 'inline_vision' : 'image_analyzer_fallback',
    });

    if (supportsInlineVision) {
      const contentParts = [];
      if (textPart) {
        contentParts.push({ type: 'text', text: textPart });
      }
      imageAttachments.forEach((attachment) => {
        const imageUrl = attachment.content?.startsWith('data:')
          ? attachment.content
          : `data:${attachment.mimeType};base64,${attachment.content}`;
        contentParts.push({
          type: 'image_url',
          image_url: { url: imageUrl },
        });
      });

      return {
        content: contentParts.length > 1 ? contentParts : textPart,
        visionModel: currentModel,
      };
    }

    let imageSummary = '';
    try {
      const imageAnalyzer = this.imageAnalyzer || this.getImageAnalyzer?.();
      if (!imageAnalyzer?.analyzeImages) {
        throw new Error('image analyzer unavailable');
      }
      imageSummary = await imageAnalyzer.analyzeImages(imageAttachments, {
        currentProviderId: providerConfig.id,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: currentModel,
      });
    } catch (error) {
      this.log.warn('image analysis failed, fallback to text-only prompt', {
        error: error?.message || String(error),
      });
    }

    this.log.info('image attachments normalized to text context', {
      model: currentModel,
      provider: providerConfig.name,
      imageCount: imageAttachments.length,
      imageSummaryLen: imageSummary.length,
      hasImageSummary: !!imageSummary,
    });

    return {
      content: [textPart, imageSummary].filter(Boolean).join('\n\n'),
    };
  }
}

module.exports = ImageService;
