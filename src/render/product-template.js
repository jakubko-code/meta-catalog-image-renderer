import { formatPrice } from "../pricing/format-price.js";

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

export function createProductTemplate(product, config, assets, productImage) {
  const { width, height } = config.output;
  const { brand, template } = config;
  const theme = template.theme ?? brand;
  const withoutBackground = template.productImage.backgroundRemoval?.enabled === true;
  const scale = Math.min(width, height) / 1080;
  const size = (value) => Math.round(value * scale);
  const padding = size(template.padding);
  const layout = template.layout ?? "classic";
  const footerHeight = size(layout === "bottomBanner" ? 150 : 176);
  const priceWidth = layout === "bottomBanner" ? width - (padding * 2) : size(layout === "split" ? 360 : 510);
  const productTop = size(layout === "minimal" ? 96 : layout === "split" ? 150 : 128);
  const configuredProductHeight = Math.round(height * (template.productImage.heightPercent / 100));
  const productHeight = layout === "split"
    ? Math.min(configuredProductHeight, height - productTop - padding)
    : layout === "bottomBanner"
      ? Math.min(configuredProductHeight + size(90), height - productTop - footerHeight - padding * 2)
      : configuredProductHeight;
  const productWidth = layout === "split" ? Math.round(width * 0.58) - padding : width - (padding * 2);
  const logoWidth = size(template.logo.maxWidth);
  const logoHeight = Math.round(logoWidth / assets.logo.aspectRatio);
  const hasDiscount = product.discountPercent !== null
    && product.discountPercent >= template.discountBadge.minimumPercent;

  const children = [
    element("div", {
      style: {
        display: "flex",
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height: size(14),
        backgroundColor: theme.primaryColor,
      },
    }),
    element("div", {
      style: {
        display: "flex",
        position: "absolute",
        top: productTop,
        left: padding,
        width: productWidth,
        height: productHeight,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withoutBackground || layout === "minimal" ? "transparent" : "#ffffff",
        borderRadius: size(layout === "minimal" ? 0 : 28),
        border: withoutBackground || layout === "minimal" ? "0px solid transparent" : `${size(2)}px solid ${theme.primaryColor}`,
        overflow: "hidden",
      },
    }, element("img", {
      src: productImage,
      width: productWidth - size(layout === "minimal" || withoutBackground ? 0 : 28),
      height: productHeight - size(withoutBackground ? 0 : 28),
      style: { objectFit: template.productImage.fit },
    })),
  ];

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

  if (template.discountBadge.show && hasDiscount) {
    children.push(element("div", {
      style: {
        display: "flex",
        ...anchoredPosition(template.discountBadge.position, padding),
        minWidth: size(160),
        height: size(104),
        paddingLeft: size(28),
        paddingRight: size(28),
        alignItems: "center",
        justifyContent: "center",
        borderRadius: size(52),
        backgroundColor: template.discountBadge.backgroundColor,
        color: template.discountBadge.textColor,
        fontSize: size(42),
        fontWeight: 700,
      },
    }, template.discountBadge.text.replace("{percent}", product.discountPercent)));
  }

  if (template.price.show) {
    const priceChildren = [
      element("div", {
        style: {
          display: "flex",
          fontSize: size(18),
          fontWeight: 700,
          letterSpacing: size(2),
          color: theme.primaryColor,
        },
      }, product.price.sale === null ? template.price.regularLabel : template.price.saleLabel),
      element("div", {
        style: {
          display: "flex",
          alignItems: "baseline",
          gap: size(20),
          marginTop: size(4),
        },
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
            color: template.price.originalPriceColor,
            fontSize: size(28),
            fontWeight: 400,
            textDecoration: "line-through",
          },
        }, formatPrice(product.price.regular, product.price.currency))
        : null),
    ].filter(Boolean);

    children.push(element("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        ...(layout === "split"
          ? { position: "absolute", right: padding, bottom: padding }
          : anchoredPosition(template.price.position, padding)),
        width: priceWidth,
        height: footerHeight,
        paddingLeft: size(34),
        paddingRight: size(34),
        justifyContent: "center",
        borderRadius: size(layout === "bottomBanner" ? 12 : layout === "minimal" ? 999 : 24),
        backgroundColor: template.price.backgroundColor,
      },
    }, ...priceChildren));
  }

  if (template.title.show) {
    const titleOnRight = template.price.position.endsWith("Left");
    const titleStyle = layout === "split"
      ? {
        position: "absolute", right: padding, top: size(245), width: width - productWidth - (padding * 3),
        height: size(270), alignItems: "center",
      }
      : layout === "bottomBanner"
        ? { position: "absolute", left: padding, bottom: footerHeight + padding * 2, width: width - padding * 2, height: size(80), alignItems: "center" }
        : {
          position: "absolute", bottom: padding,
          ...(titleOnRight ? { right: padding } : { left: padding }),
          width: width - (padding * 3) - priceWidth, height: footerHeight, alignItems: "center",
        };
    children.push(element("div", {
      style: {
        display: "flex",
        ...titleStyle,
        color: template.title.textColor,
        fontSize: size(template.title.fontSize),
        fontWeight: 700,
        lineHeight: 1.25,
      },
    }, truncate(product.title, template.title.maxCharacters)));
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
  }, ...children);
}
