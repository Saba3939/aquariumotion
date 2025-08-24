import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "AQUARIUMOTION",
	description: "あなたの水槽を管理しよう",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='ja'>
			<body className='min-h-screen'>{children}</body>
		</html>
	);
}
