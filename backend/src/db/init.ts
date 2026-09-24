import { inicializarBaseDeDatos } from "./inicializar.js";

inicializarBaseDeDatos()
  .then(() => console.log("Esquema y usuarios iniciales listos"))
  .catch((error) => {
    console.error("Error inicializando la base de datos:", error.message);
    process.exit(1);
  });
