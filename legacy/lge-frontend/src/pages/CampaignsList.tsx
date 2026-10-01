import { useState, useEffect } from "react";
import { GeometricCampaignTile } from "../components/GeometricCampaignTile";
import { useFetchCampaigns } from "../hooks";
import { Campaign } from "../types";

export function CampaignsList() {
  const { campaigns, loading } = useFetchCampaigns();
  const [filteredCampaigns, setFilteredCampaigns] = useState<Campaign[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  useEffect(() => {
    setFilteredCampaigns(campaigns);
  }, [campaigns]);

  const applyFilter = (filter: string) => {
    let filtered = [...campaigns];

    switch (filter) {
      case "ending-soon":
      case "hot":
      case "nearly-there":
      case "cheapest":
        filtered = filtered.sort((a, b) => {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        break;
      default:
        break;
    }

    setFilteredCampaigns(filtered);
  };

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    applyFilter(filter);
  };

  return (
    <div className="campaigns-list-page">
      <div className="page-header">
        <div></div>
      </div>

      {/* Filter Buttons */}
      <div className="campaign-filters">
        <button
          className={`filter-btn ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => handleFilterChange("all")}
        >
          All
        </button>
        <button
          className={`filter-btn ${activeFilter === "ending-soon" ? "active" : ""}`}
          onClick={() => handleFilterChange("ending-soon")}
        >
          Ending Soon
        </button>
        {/* <button
          className={`filter-btn ${activeFilter === "hot" ? "active" : ""}`}
          onClick={() => handleFilterChange("hot")}
        >
          Hot
        </button> */}
        <button
          className={`filter-btn ${activeFilter === "nearly-there" ? "active" : ""}`}
          onClick={() => handleFilterChange("nearly-there")}
        >
          {`Nearly 100%`}
        </button>
        {/* <button
          className={`filter-btn ${activeFilter === "cheapest" ? "active" : ""}`}
          onClick={() => handleFilterChange("cheapest")}
        >
          Cheapest
        </button> */}
      </div>

      {loading ? (
        <div className="loading">Loading campaigns...</div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="empty-state">
          <p>No campaigns available yet.</p>
          <p>Be the first to create one!</p>
        </div>
      ) : (
        <div className="campaigns-grid">
          {filteredCampaigns.map((campaign) => (
            <GeometricCampaignTile key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
