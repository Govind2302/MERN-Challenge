const express = require('express');
const app = express();
const PORT = 5500;

// Serve static files from the 'frontend' directory
app.use(express.static('frontend'));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}}`);
});
