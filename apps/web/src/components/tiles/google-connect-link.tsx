import { GOOGLE_CONNECT_ROUTE } from "@pryladova/shared";

/** POST so a cross-site navigation cannot start OAuth with the lax session cookie. */
export const GoogleConnectLink = ({
  label,
  reconnect = false,
}: {
  label: string;
  reconnect?: boolean;
}) => (
  <form
    method="post"
    action={reconnect ? `${GOOGLE_CONNECT_ROUTE}?reconnect=1` : GOOGLE_CONNECT_ROUTE}
  >
    <button type="submit" className="text-caption font-medium text-primary hover:underline">
      {label}
    </button>
  </form>
);
