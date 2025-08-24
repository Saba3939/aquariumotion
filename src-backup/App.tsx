import HomePage from "./pages/HomePage";
import Profile from "./pages/Profile";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";

function App() {
	return (
		<div>
			<BrowserRouter>
				<Routes>
					<Route path='/' element={<HomePage />} />
					<Route path='/profile' element={<Profile />} />
				</Routes>
			</BrowserRouter>
		</div>
	);
}

export default App;
