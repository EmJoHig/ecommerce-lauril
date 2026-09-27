// Only these destinations may be selected by a login/registration request.
export function customerReturnPath(value: unknown): "/checkout" | "/mi-cuenta" {
  return value === "/checkout" ? "/checkout" : "/mi-cuenta";
}
