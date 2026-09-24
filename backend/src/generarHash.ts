import bcrypt from "bcryptjs";

async function generarHash() {
  const hash = await bcrypt.hash("pepe123", 10);

  console.log(hash);
}

generarHash();