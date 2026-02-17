const express = require('express');
const { Pool } = require('pg');
const jwt = require('json-web-token');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 3000;
const database_url = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/webshop';
const jwt_secret = process.env.JWT_SECRET || 'your_jwt_secret_key';
const admin_password = process.env.ADMIN_PASSWORD || '57h84tiawn748r';

const pool = new Pool({
    connectionString: database_url,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(express.json());

app.use(async (req, res, next) => {
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method) && req.path.startsWith('/products')) {
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
        
        try {
            const decoded = await new Promise((resolve, reject) => {
                jwt.decode(jwt_secret, token, (err, decodedPayload) => {
                    if (err) return reject(err);
                    resolve(decodedPayload);
                });
            });
            req.user = decoded;
        } catch (error) {
            console.warn('-| Error 403 returned to client due to invalid or expired token.');
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
    }
    
    next();
});

app.post('/auth/signup', async (req, res) => {
    console.log('Received POST request at \'/auth/signup\' with body:', req.body);
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    
    try {
        const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            console.warn('-| Error 409 returned to client due to username already existing.');
            return res.status(409).json({ error: 'Username already exists.' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );
        
        const user = result.rows[0];
        const payload = { username: user.username, userId: user.id, exp: Math.floor(Date.now() / 1000) + 24 * 3600 };
        const token = await new Promise((resolve, reject) => {
            jwt.encode(jwt_secret, payload, (err, encoded) => {
                if (err) return reject(err);
                resolve(encoded);
            });
        });

        console.log(`User ${username} signed up successfully.`);
        res.status(201).json({ token, user: { id: user.id, username: user.username } });
    } catch (error) {
        console.error('Error signing up user:', error);
        res.status(500).json({ error: 'Failed to sign up.' });
    }
});

app.post('/auth/login', async (req, res) => {
    console.log('Received POST request at \'/auth/login\' with body:', req.body);
    const { username, password } = req.body;
    
    try {
        const result = await pool.query('SELECT id, username, password FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            console.warn('-| Error 401 returned to client due to invalid credentials provided in login attempt.');
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            console.warn('-| Error 401 returned to client due to invalid credentials provided in login attempt.');
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        const payload = { username: user.username, userId: user.id, exp: Math.floor(Date.now() / 1000) + 24 * 3600 };
        const token = await new Promise((resolve, reject) => {
            jwt.encode(jwt_secret, payload, (err, encoded) => {
                if (err) return reject(err);
                resolve(encoded);
            });
        });

        res.status(200).json({ token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: 'Failed to log in.' });
    }
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

app.get('/products/:id', async (req, res) => {
    console.log(`Received GET request at '/products/${req.params.id}'`);
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('--| Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product.' });
    }
});

app.get('/products/orders', async (req, res) => {
    console.log('Received GET request at \'/products/orders\'');
    try {
        const result = await pool.query('SELECT * FROM orders');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('--| Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders.' });
    }
});

app.post('/products/:id/order', async (req, res) => {
    console.log(`Received POST request at '/products/${req.params.id}/order' with body:`, req.body);
    const { id } = req.params;
    const { quantity } = req.body;
    
    if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be a positive integer.' });
    }

    try {
        const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (productResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        
        const product = productResult.rows[0];
        const totalPrice = product.price * quantity;
        
        const orderResult = await pool.query(
            'INSERT INTO orders (product_id, quantity, total_price) VALUES ($1, $2, $3) RETURNING *',
            [id, quantity, totalPrice]
        );
        
        res.status(201).json(orderResult.rows[0]);
    } catch (error) {
        console.error('--| Error placing order:', error);
        res.status(500).json({ error: 'Failed to place order.' });
    }
})

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