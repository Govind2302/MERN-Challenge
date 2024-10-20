const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// Connect to MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI; 
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('Error connecting to MongoDB Atlas:', err));

// Define schema
const transactionSchema = new mongoose.Schema({
  id: Number,
  title: String,
  price: Number,
  description: String,
  category: String,
  image: String,
  sold: Boolean,
  dateOfSale: Date
});

const Transaction = mongoose.model('Transaction', transactionSchema);


async function fetchData(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      return null;
    }
  }

// API to initialize database
app.get('/api/initialize-db', async (req, res) => {
  try {
    // Fetch data from third-party API
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const data = response.data;

    // Clear existing data
    await Transaction.deleteMany({});

    // Insert new data
    await Transaction.insertMany(data);

    res.json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Error initializing database:', error);
    res.status(500).json({ error: 'An error occurred while initializing the database' });
  }
});

app.get('/check-data', async (req, res) => {
    try {
      // Count total documents
      const totalCount = await Transaction.countDocuments();
  
      // Get a sample of documents
      const sampleDocuments = await Transaction.find().limit(60);
  
      // Calculate total size of sample documents
      const totalSize = sampleDocuments.reduce((acc, doc) => {
        return acc + JSON.stringify(doc).length;
      }, 0);
  
      // Calculate average document size
      const avgDocumentSize = totalSize / sampleDocuments.length;
  
      res.json({
        totalDocuments: totalCount,
        sampleDocuments: sampleDocuments,
        estimatedCollectionSize: totalCount * avgDocumentSize,
        estimatedAvgDocumentSize: avgDocumentSize
      });
    } catch (error) {
      console.error('Error checking data:', error);
      res.status(500).json({ error: 'An error occurred while checking the data' });
    }
  });

// API to list all transactions with search and pagination
app.get('/api/transactions', async (req, res) => {
    try {
      const { page = 1, perPage = 10, search = '' } = req.query;
      const skip = (page - 1) * perPage;
  
      let query = {};
      if (search) {
        query = {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { price: isNaN(search) ? undefined : Number(search) }
          ].filter(Boolean)
        };
      }
  
      const totalCount = await Transaction.countDocuments(query);
      const transactions = await Transaction.find(query)
        .skip(skip)
        .limit(Number(perPage));
  
      res.json({
        totalCount,
        page: Number(page),
        perPage: Number(perPage),
        transactions
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({ error: 'An error occurred while fetching transactions' });
    }
  });
  
  // API for statistics
app.get('/api/statistics', async (req, res) => {
    try {
      const { month, year } = req.query;
  
      if (!month || !year) {
        return res.status(400).json({ error: 'Month and year are required' });
      }
  
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  
      console.log('Start Date:', startDate);
      console.log('End Date:', endDate);
  
      // Debug: Check for any documents in the date range
      const sampleDoc = await Transaction.findOne({
        dateOfSale: { $gte: startDate, $lte: endDate }
      });
      console.log('Sample document in date range:', sampleDoc);
  
      const stats = await Transaction.aggregate([
        {
          $match: {
            dateOfSale: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalSaleAmount: {
              $sum: { $cond: [{ $eq: ['$sold', true] }, '$price', 0] }
            },
            totalSoldItems: {
              $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] }
            },
            totalNotSoldItems: {
              $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] }
            }
          }
        }
      ]);
  
      console.log('Aggregation result:', stats);
  
      if (stats.length === 0) {
        // Debug: If no results, check total count of documents
        const totalCount = await Transaction.countDocuments();
        console.log('Total documents in collection:', totalCount);
  
        // Debug: Check a sample document
        const sampleDoc = await Transaction.findOne();
        console.log('Sample document:', sampleDoc);
      }
  
      const result = stats.length > 0 ? stats[0] : {
        totalSaleAmount: 0,
        totalSoldItems: 0,
        totalNotSoldItems: 0
      };
  
      res.json(result);
    } catch (error) {
      console.error('Error fetching statistics:', error);
      res.status(500).json({ error: 'An error occurred while fetching statistics' });
    }
  });

app.get('/api/bar-chart', async (req, res) => {
    try {
      const { month } = req.query;
  
      if (!month) {
        return res.status(400).json({ error: 'Month is required' });
      }
  
      const priceRanges = [
        { min: 0, max: 100 },
        { min: 101, max: 200 },
        { min: 201, max: 300 },
        { min: 301, max: 400 },
        { min: 401, max: 500 },
        { min: 501, max: 600 },
        { min: 601, max: 700 },
        { min: 701, max: 800 },
        { min: 801, max: 900 },
        { min: 901, max: Infinity }
      ];
  
      const pipeline = [
        {
          $match: {
            $expr: {
              $eq: [{ $month: '$dateOfSale' }, parseInt(month)]
            }
          }
        },
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 101, 201, 301, 401, 501, 601, 701, 801, 901],
            default: '901-above',
            output: {
              count: { $sum: 1 }
            }
          }
        }
      ];
  
      const result = await Transaction.aggregate(pipeline);
  
      const formattedResult = priceRanges.map((range, index) => {
        const matchingRange = result.find(r => r._id === range.min) || { count: 0 };
        return {
          range: index === priceRanges.length - 1 ? '901-above' : `${range.min} - ${range.max}`,
          count: matchingRange.count
        };
      });
  
      res.json(formattedResult);
    } catch (error) {
      console.error('Error fetching bar chart data:', error);
      res.status(500).json({ error: 'An error occurred while fetching bar chart data' });
    }
  });


// API for pie chart data
app.get('/api/pie-chart', async (req, res) => {
    try {
      const { month } = req.query;
  
      if (!month) {
        return res.status(400).json({ error: 'Month is required' });
      }
  
      const pipeline = [
        {
          $match: {
            $expr: {
              $eq: [{ $month: '$dateOfSale' }, parseInt(month)]
            }
          }
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ];
  
      const result = await Transaction.aggregate(pipeline);
  
      const formattedResult = result.map(item => ({
        category: item._id,
        count: item.count
      }));
  
      res.json(formattedResult);
    } catch (error) {
      console.error('Error fetching pie chart data:', error);
      res.status(500).json({ error: 'An error occurred while fetching pie chart data' });
    }
  });


// Combined API endpoint
app.get('/api/combined-data', async (req, res) => {
    try {
      const { month, year } = req.query;
  
      if (!month || !year) {
        return res.status(400).json({ error: 'Month and year are required' });
      }
  
      const baseUrl = `http://localhost:${PORT}`;  // Adjust this if your base URL is different
  
      const [statistics, barChart, pieChart] = await Promise.all([
        fetchData(`${baseUrl}/api/statistics?month=${month}&year=${year}`),
        fetchData(`${baseUrl}/api/bar-chart?month=${month}`),
        fetchData(`${baseUrl}/api/pie-chart?month=${month}`)
      ]);
  
      const combinedData = {
        statistics,
        barChart,
        pieChart
      };
  
      res.json(combinedData);
    } catch (error) {
      console.error('Error fetching combined data:', error);
      res.status(500).json({ error: 'An error occurred while fetching combined data' });
    }
  });

app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});