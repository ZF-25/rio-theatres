import CustomerLayout from "./CustomerLayout";

function AdminLayout({ headerProps, onLogoClick, children }) {
  return (
    <CustomerLayout
      headerProps={{
        ...headerProps,
        adminOpen: true,
      }}
      onLogoClick={onLogoClick}
    >
      {children}
    </CustomerLayout>
  );
}

export default AdminLayout;
