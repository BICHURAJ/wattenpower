import express from "express";

/**
 * Builds a standard list/read/create/update/delete router for a model.
 * Every list endpoint supports ?q= search, ?status= filter, and page/limit paging,
 * because every table screen in the prototype needs exactly that.
 */
export function crudRouter(Model, options = {}) {
  const {
    searchFields = [],
    populate = [],
    defaultSort = "-createdAt",
    filterFields = ["status"],
    afterCreate,
    afterUpdate,
    // async (req) => filter applied to every list request, before the query-string filters.
    baseFilter,
  } = options;

  const router = express.Router();

  router.get("/", async (req, res, next) => {
    try {
      const { q, page = 1, limit = 25, sort } = req.query;
      const filter = baseFilter ? { ...(await baseFilter(req)) } : {};

      if (q && searchFields.length) {
        filter.$or = searchFields.map((field) => ({
          [field]: new RegExp(escapeRegex(q), "i"),
        }));
      }
      for (const field of filterFields) {
        if (req.query[field] && req.query[field] !== "All")
          filter[field] = req.query[field];
      }
      if (req.query.client) filter.client = req.query.client;
      if (req.query.installation) filter.installation = req.query.installation;

      const perPage = Math.min(Number(limit) || 25, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * perPage;

      let query = Model.find(filter)
        .sort(sort || defaultSort)
        .skip(skip)
        .limit(perPage);
      for (const p of populate) query = query.populate(p);

      const [items, total] = await Promise.all([
        query.lean(),
        Model.countDocuments(filter),
      ]);
      res.json({
        items,
        total,
        page: Number(page) || 1,
        limit: perPage,
        pages: Math.ceil(total / perPage) || 1,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      let query = Model.findById(req.params.id);
      for (const p of populate) query = query.populate(p);
      const doc = await query;
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.json(doc);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const doc = await Model.create(req.body);
      if (afterCreate) await afterCreate(doc, req);
      res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", async (req, res, next) => {
    try {
      const doc = await Model.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: "Not found" });
      doc.set(req.body);
      await doc.save();
      if (afterUpdate) await afterUpdate(doc, req);
      res.json(doc);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
