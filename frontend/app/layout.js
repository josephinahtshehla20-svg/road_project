import "./globals.css";

export const metadata = {
  title: "Road Accident Risk Predictor",
  description: "Predict accident risk from road, weather, lighting and traffic history.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
