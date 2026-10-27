/**
 * A Shopify cart permalink (/cart/VARIANT:1) replaces whatever is already in the cart and jumps to checkout, so two
 * picks never end up in one cart. /cart/add?id=VARIANT adds the piece and opens the cart instead.
 */
export function addToCartUrl(cartUrl: string): string {
  const m = cartUrl.match(/^(https:\/\/[^/]+)\/cart\/(\d+):(\d+)$/);
  return m ? `${m[1]}/cart/add?id=${m[2]}&quantity=${m[3]}` : cartUrl;
}

/** The stores' feeds list prices in US dollars; a shopper outside the US sees a converted price at checkout. */
export function usd(price: number): string {
  return `US$${price.toFixed(0)}`;
}
