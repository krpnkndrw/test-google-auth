import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3000";

function App() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [isAuth, setIsAuth] = useState(false);

  const handleClick = async () => {
    const response = await fetch(`${API_BASE}/auth`, { method: "POST" });
    const { authUrl } = await response.json();
    window.location.href = authUrl;
  };

  const handleLogout = async () => {
    const response = await fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include",
    });
    const { ok } = await response.json();
    if (ok) {
      setIsAuth(false);
      setUser(null);
    }
  };

  useEffect(() => {
    const getUser = async () => {
      try {
        const response = await fetch(`${API_BASE}/me`, {
          method: "GET",
          credentials: "include",
        });
        if (response.status === 401) {
          setIsAuth(false);
          return;
        }
        setIsAuth(true);
        const data = await response.json();
        setUser(data);
      } catch (error) {
        console.log(error);
        setIsAuth(false);
      }
    };
    getUser();
  }, []);

  return (
    <>
      <div>
        <button onClick={handleClick}>Sign in</button>
        {isAuth ? (
          <div>
            <p>is auth</p>
            <p>{user?.email}</p>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <p> no auth</p>
        )}
      </div>
    </>
  );
}

export default App;
