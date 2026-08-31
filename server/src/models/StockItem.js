import mongoose from 'mongoose'

// Screen 15 -- the "Stock (Just-in-Time Inventory)" and "UK Suppliers" nodes.
const StockItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['Chargers', 'Accessories', 'Electrical', 'Consumables'], default: 'Electrical' },
  stock: { type: Number, default: 0 },
  unit: { type: String, default: 'pcs' },
  reorderLevel: { type: Number, default: 0 },
  supplier: String,
  unitCost: { type: Number, default: 0 },
}, { timestamps: true })

StockItemSchema.virtual('needsReorder').get(function () {
  return this.stock <= this.reorderLevel
})

StockItemSchema.set('toJSON', { virtuals: true })

export default mongoose.model('StockItem', StockItemSchema)
