import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
});

export const imageUrl = (image_id) => (image_id ? `${API}/images/${image_id}` : null);
