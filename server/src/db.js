import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/watten_power'
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
  console.log(`[db] connected to ${uri.replace(/\/\/.*@/, '//***@')}`)
  return mongoose.connection
}
