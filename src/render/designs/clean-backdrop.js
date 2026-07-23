import { formatPrice } from "../../pricing/format-price.js";

function element(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.length <= 1 ? children[0] : children,
    },
  };
}

function anchoredPosition(position, offset) {
  const style = { position: "absolute" };
  if (position.startsWith("top")) style.top = offset;
  else style.bottom = offset;
  if (position.endsWith("Left")) style.left = offset;
  else style.right = offset;
  return style;
}

function truncate(value, maximumLength) {
  if (!value || value.length <= maximumLength) return value ?? "";
  return `${value.slice(0, maximumLength - 1).trimEnd()}…`;
}

export function renderCleanBackdrop(product, config, assets, productImage) {
  const { width, height } = config.output;
  const { template } = config;
  const scale = Math.min(width, height) / 1080;
  const size = (value) => Math.round(value * scale);
  const padding = size(template.padding);
  const productHeight = Math.round(height * (template.productImage.heightPercent / 100));
  const productTop = Math.max(size(150), Math.round((height - productHeight) / 2));
  const logoWidth = size(template.logo.maxWidth);
  const logoHeight = Math.round(logoWidth / assets.logo.aspectRatio);
  const hasDiscount = product.discountPercent !== null
    && product.discountPercent >= template.discountBadge.minimumPercent;
  const pricePosition = template.price.position ?? "topLeft";
  const priceOnLeft = pricePosition.endsWith("Left");
  const priceAtTop = pricePosition.startsWith("top");
  const priceBlockStyle = {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    ...(priceOnLeft ? { left: padding } : { right: padding }),
    ...(priceAtTop ? { top: padding } : { bottom: padding }),
    alignItems: priceOnLeft ? "flex-start" : "flex-end",
  };

  const children = [];
  if (template.backgroundImage?.show && assets.background) {
    children.push(element("img", {
      src: assets.background.dataUri,
      width,
      height,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        objectFit: "cover",
      },
    }));
  }

  children.push(element("div", {
    style: {
      display: "flex",
      position: "absolute",
      top: productTop,
      left: padding,
      width: width - padding * 2,
      height: Math.min(productHeight, height - productTop - padding),
      alignItems: "center",
      justifyContent: "center",
    },
  }, element("img", {
    src: productImage,
    width: width - padding * 2,
    height: Math.min(productHeight, height - productTop - padding),
    style: { objectFit: template.productImage.fit },
  })));

  if (template.price.show) {
    children.push(element("div", {
      style: priceBlockStyle,
    },
    element("div", {
      style: {
        display: "flex",
        color: template.price.textColor,
        fontSize: size(template.price.fontSize),
        fontWeight: 700,
        lineHeight: 1,
      },
    }, formatPrice(product.price.current, product.price.currency)),
    template.price.showOriginalPrice && product.price.sale !== null
      ? element("div", {
        style: {
          display: "flex",
          marginTop: size(7),
          color: template.price.originalPriceColor,
          fontSize: size(Math.max(22, Math.round(template.price.fontSize * 0.5))),
          textDecoration: "line-through",
        },
      }, formatPrice(product.price.regular, product.price.currency))
      : null,
    template.discountBadge.show && hasDiscount
      ? element("div", {
        style: {
          display: "flex",
          marginTop: size(12),
          color: template.discountBadge.textColor,
          fontSize: size(Math.max(24, Math.round(template.price.fontSize * 0.48))),
          fontWeight: 700,
          lineHeight: 1,
        },
      }, template.discountBadge.text.replace("{percent}", product.discountPercent))
      : null));
  }

  if (template.title.show) {
    children.push(element("div", {
      style: {
        display: "flex",
        position: "absolute",
        left: padding,
        right: padding,
        bottom: padding,
        justifyContent: "center",
        color: template.title.textColor,
        fontSize: size(template.title.fontSize),
        fontWeight: 700,
        lineHeight: 1.2,
      },
    }, truncate(product.title, template.title.maxCharacters)));
  }

  if (template.logo.show) {
    children.push(element("img", {
      src: assets.logo.dataUri,
      width: logoWidth,
      height: logoHeight,
      style: {
        ...anchoredPosition(template.logo.position, padding),
        objectFit: "contain",
      },
    }));
  }

  return element("div", {
    lang: "sk-SK",
    style: {
      display: "flex",
      position: "relative",
      width,
      height,
      overflow: "hidden",
      backgroundColor: template.backgroundColor,
      fontFamily: "BrandFont",
    },
  }, ...children.filter(Boolean));
}
