import { Outlet, useMatch } from "react-router-dom";
import clsx from "clsx";
import OrdersList from "./OrdersList";

export default function OrdersLayout() {
  const detailMatch = useMatch("/commandes/:id");

  return (
    <div className="lg:grid lg:grid-cols-[380px_1fr] lg:h-dvh">
      <div className={clsx("lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-line", detailMatch && "hidden lg:block")}>
        <OrdersList />
      </div>
      <div className={clsx(!detailMatch && "hidden lg:block", "lg:h-dvh lg:overflow-y-auto")}>
        <Outlet />
      </div>
    </div>
  );
}
