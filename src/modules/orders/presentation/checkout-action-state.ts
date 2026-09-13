export type CheckoutFormValues = Readonly<{
  shippingMethodId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressMode: "saved" | "new";
  savedAddressId: string;
  recipientFirstName: string;
  recipientLastName: string;
  shippingPhone: string;
  street: string;
  streetNumber: string;
  floorApartment: string;
  city: string;
  province: string;
  postalCode: string;
  references: string;
}>;

export type CheckoutActionState = Readonly<{
  status: "idle" | "error";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: CheckoutFormValues;
}>;

export const initialCheckoutActionState: CheckoutActionState = { status: "idle", message: "" };
