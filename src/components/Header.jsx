import logoImg from "../image/logo.jpg";

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#7fbfff",
  width: "100%",
  minHeight: "60px",
  padding: "0px",
  margin: "0px",
};

const logoStyle = {
  width: "40%",
  height: "auto",
  borderRadius: "2px",
};

export const Header = () => {
  return (
    <div style={headerStyle}>
      <img src={logoImg} alt="CODEMATESロゴ" style={logoStyle} />
    </div>
  );
};