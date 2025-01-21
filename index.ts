import express, {
	type Request,
	type Response,
} from "express";
import cors from "cors";
import mongoose, { type Document, Schema } from "mongoose";
import mongoSanitize from "express-mongo-sanitize";

const app = express();

// Define the interface for the ViewCount document
interface IPLog {
	ip: string;
	timestamp: Date;
}

interface ViewCountDocument extends Document {
	repo: string;
	views: number;
	ipLogs: IPLog[];
}

// Define the view count schema
const viewCountSchema = new Schema<ViewCountDocument>({
	repo: { type: String, required: true },
	views: { type: Number, required: true, default: 0 },
	ipLogs: [
		{
			ip: { type: String, required: true },
			timestamp: { type: Date, required: true },
		},
	],
});

const ViewCount = mongoose.model<ViewCountDocument>(
	"ViewCount",
	viewCountSchema,
);

// Connect to MongoDB
(async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI || "");
		console.log("Connected to MongoDB");
	} catch (error) {
		console.error("Error connecting to MongoDB:", error);
	}
})();

// Apply CORS middleware
app.use(cors());

// Sanitize user input to prevent MongoDB injection attacks
app.use(mongoSanitize());

// Handle GET request for individual repository
app.get("/view/:repo", async (req: Request, res: Response) => {
	const { repo } = req.params;
	const userIp = (req.headers["x-forwarded-for"] ||
		req.socket.remoteAddress) as string;

	try {
		// Find the document for this repository in MongoDB
		let countDoc = await ViewCount.findOne({ repo });

		if (!countDoc) {
			// If not found, initialize it with a view count of 0
			countDoc = new ViewCount({ repo, views: 0, ipLogs: [] });
			await countDoc.save();
		}

		// Check if this IP has incremented the view count in the last hour
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const recentEntry = countDoc.ipLogs.find(
			(log) => log.ip === userIp && log.timestamp > oneHourAgo,
		);

		if (recentEntry) {
			// If the IP already viewed in the past hour, send the current view count
			const response = {
				schemaVersion: 1,
				label: "Profile View",
				message: String(countDoc.views),
				color: "blue",
			};

			res.status(200).send(JSON.stringify(response));
		}

		// Increment the view count and log the IP address
		countDoc.views++;
		countDoc.ipLogs.push({ ip: userIp, timestamp: new Date() });

		// Remove old logs to optimize performance
		countDoc.ipLogs = countDoc.ipLogs.filter(
			(log) => log.timestamp > oneHourAgo,
		);

		await countDoc.save();

		const response = {
			schemaVersion: 1,
			label: "Profile View",
			message: String(countDoc.views),
			color: "blue",
		};

		res.status(200).send(JSON.stringify(response));
	} catch (error) {
		console.error("Error processing request:", error);
		res.status(500).send("Server Error");
	}
});

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
