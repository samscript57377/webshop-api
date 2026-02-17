const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const database_url = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/webshop';

const pool = new Pool({
    connectionString: database_url,
    ssl: {
        rejectUnauthorized: false
    }
});


app.use(express.json());

app.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            console.warn('-| Error 401 returned to client due to missing Authorization header.');
            return res.status(401).json({ error: 'Authorization required.' });
        }

        const [scheme, token] = authHeader.split(' ');
        if (scheme !== 'Bearer' || !token) {
            console.warn('-| Error 401 returned to client due to invalid authorization format in Authorization header.');
            return res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
        }
        
        if (!token) {
            console.warn('-| Error 403 returned to client due to missing token in Authorization header.');
            return res.status(403).json({ error: 'Invalid token.' });
        }
    }
    
    next();
});

app.get('/', (req, res) => {
    console.log('Received GET request at \'/\'');
    res.status(200).json({ status: 'Webshop API is online.' });
});

app.get('/products', async (req, res) => {
    console.log('Received GET request at \'/products\'');
    try {
        const result = await pool.query('SELECT * FROM products');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('--| Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products.' });
    }
});

app.post('/products', async (req, res) => {
    console.log('Received POST request at \'/products\' with body:', req.body);
    const { name, rawImageArr, description, price } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO products (name, rawImageArr, description, price) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, rawImageArr, description, price]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('--| Error adding product:', error);
        res.status(500).json({ error: 'Failed to add product.' });
    }
});

app.patch('/products/:id', async (req, res) => {
    console.log(`Received PATCH request at '/products/${req.params.id}' with body:`, req.body);
    const { id } = req.params;
    const { name, rawImageArr, description, price } = req.body;
    try {
        const result = await pool.query(
            'UPDATE products SET name = $1, rawImageArr = $2, description = $3, price = $4 WHERE id = $5 RETURNING *',
            [name, rawImageArr, description, price, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('--| Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product.' });
    }
});

app.delete('/products/:id', async (req, res) => {
    console.log(`Received DELETE request at '/products/${req.params.id}'`);
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('--| Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product.' });
    }
});

app.listen(port, () => {
    console.log(`Webshop API running on port ${port}`);
});