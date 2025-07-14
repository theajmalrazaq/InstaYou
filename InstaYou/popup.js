// Function to send alert to the page instead of showing in the popup
function showPageAlert(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: (alertMsg) => {
          alert(alertMsg);
        },
        args: [message]
      });
    }
  });
}

// Main download button functionality
document.getElementById("downloadBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: storeFollowerCounts,
    });
  });
});

// Compare button functionality
document.getElementById("compareBtn").addEventListener("click", () => {
  showSavedUsersList();
});

// Update All button functionality
document.getElementById("updateAllBtn").addEventListener("click", () => {
  updateAllTrackedUsers();
});

// Back button functionality
document.getElementById("backButton").addEventListener("click", () => {
  // Hide comparison UI elements
  document.getElementById("author").style.display="block";
  document.getElementById("userList").style.display = "none";
  document.getElementById("compareResults").style.display = "none";
  document.getElementById("backButton").style.display = "none";
  document.getElementById("clearListBtn").style.display = "none";
  document.getElementById("exportBtn").style.display = "none";
  document.getElementById("sortSelect").style.display = "none";
  
  // Show main UI elements
  document.getElementById("mainButtons").style.display = "flex";
  document.getElementById("mainText").textContent = "Upgrade Your Stalking Skills 🚀";
  
  // Refresh stats count
  updateStatsCount();
});

// Show list of saved users from Chrome storage
function showSavedUsersList() {
  const userList = document.getElementById("userList");
  userList.innerHTML = "";
  
  // Show user list, hide main buttons
  userList.style.display = "flex";
  document.getElementById("mainButtons").style.display = "none";
  document.getElementById("backButton").style.display = "block";
  document.getElementById("author").style.display="none";
  document.getElementById("clearListBtn").style.display = "block";
  document.getElementById("exportBtn").style.display = "block";
  document.getElementById("sortSelect").style.display = "block";
  document.getElementById("mainText").textContent = "Select a user to compare stats";
  
  // THIS IS THE CRITICAL FIX: Use chrome.storage.local instead of localStorage
  chrome.storage.local.get(null, (items) => {
    
    // Get all keys that start with "instagram_stats_" and collect user data
    const userData = [];
    for (const key in items) {
      
      if (key && key.startsWith("instagram_stats_")) {
        const username = key.replace("instagram_stats_", "");
        try {
          const stats = JSON.parse(items[key]);
          const latestStats = Array.isArray(stats) ? stats[stats.length - 1] : stats;
          userData.push({
            username,
            latestStats,
            lastUpdate: latestStats.timestamp,
            followerCount: latestStats.followerCount || 0
          });
        } catch (e) {
          // Skip invalid data
          continue;
        }
      }
    }
    
    // Sort the user data
    const sortBy = document.getElementById("sortSelect").value;
    userData.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.username.localeCompare(b.username);
        case 'recent':
          return new Date(b.lastUpdate) - new Date(a.lastUpdate);
        case 'followers':
          return b.followerCount - a.followerCount;
        default:
          return a.username.localeCompare(b.username);
      }
    });
    
    // If no saved users, show message
    if (userData.length === 0) {
      userList.innerHTML = "<div class='user-item'>No saved users found</div>";
      return;
    }
    
    // Add each user to the list
    userData.forEach(({username}) => {
      const deleteButton = document.createElement("button");
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => {
          const storageKey = `instagram_stats_${username}`;
          chrome.storage.local.remove(storageKey, () => {
            // Also remove notes when deleting user
            chrome.storage.local.remove(`notes_${username}`, () => {
              showSavedUsersList();
            });
          });
      
      });
      deleteButton.className = "delete-button";
      
      const notesButton = document.createElement("button");
      notesButton.textContent = "📝";
      notesButton.className = "notes-button";
      notesButton.title = "Add/Edit Notes";
      notesButton.addEventListener("click", () => {
        showNotesDialog(username);
      });
      
      const useritemname = document.createElement("div");
      useritemname.innerText = username;
      const userItem = document.createElement("div");
      userItem.className = "user-item";
      userItem.appendChild(useritemname);
      useritemname.addEventListener("click", () => {
        compareUserStats(username);
      });
      
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "user-buttons";
      buttonContainer.appendChild(notesButton);
      buttonContainer.appendChild(deleteButton);
      userItem.appendChild(buttonContainer);
      
      userList.appendChild(userItem);
    });
  });
}

// Compare user stats and show results
function compareUserStats(username) {
  document.getElementById("clearListBtn").style.display = "none";
  
  // Get the current tab to run script on
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: compareWithSavedStats,
      args: [username]
    }).then(() => {
    }).catch(error => {
      document.getElementById("compareResults").innerHTML = 
        `<div class="error">Error: ${error.message}</div>`;
      document.getElementById("compareResults").style.display = "block";
    });
  });
}

// This function runs in the context of the Instagram page
function compareWithSavedStats(usernameToCompare) {
  // Check if we're on Instagram
  if (!window.location.href.includes("instagram.com/")) {
    alert("This script only works on Instagram pages");
    return;
  }
  
  // Extract username from current URL
  const urlPath = window.location.pathname;
  const currentUsername = urlPath.split("/")[1];
  
  // Verify we're on the correct profile
  if (currentUsername !== usernameToCompare) {
    alert(`Please navigate to ${usernameToCompare}'s profile to compare stats`);
    return;
  }
  
  const { followerCount, followingCount } = getCountsFromPage();
  
  if (followerCount === null && followingCount === null) {
    alert("Could not find follower and following counts on this page");
    return;
  }
  
  // Use the provided timestamp
  const formattedDateTime = new Date().toLocaleString();
  
  // Create message to send back to popup for chrome.storage access
  chrome.runtime.sendMessage({
    action: "getStoredData",
    username: usernameToCompare,
    followerCount: followerCount,
    followingCount: followingCount,
    timestamp: formattedDateTime,
  });
  
  // Get follower and following counts from the page
  function getCountsFromPage() {
    try {
      // For Instagram's new UI, the counts are typically in sections with specific order
      // Selector for the section that contains follower/following counts
      const sections = document.querySelectorAll('section ul li');
      
      let followerCount = null;
      let followingCount = null;
      
      // Instagram profile metrics are typically ordered: Posts, Followers, Following
      if (sections && sections.length >= 3) {
        // Try to extract from the text content, looking for spans with numbers
        sections.forEach((section, index) => {
          const countText = section.textContent;
          
          // Usually the 2nd item (index 1) is followers, 3rd item (index 2) is following
          if (index === 1 && countText.includes('follower')) {
            followerCount = extractNumberFromText(countText);
          } else if (index === 2 && countText.includes('following')) {
            followingCount = extractNumberFromText(countText);
          }
        });
      }
      
      // If we couldn't find them in the sections, try an alternative method
      if (followerCount === null || followingCount === null) {
        // Alternative selector to find links with follower/following counts
        const links = document.querySelectorAll('a[href*="/' + currentUsername + '/"]');
        
        links.forEach(link => {
          const href = link.getAttribute('href');
          const text = link.textContent;
          
          // Extract counts from the link text
          if (href.includes('/followers/')) {
            followerCount = extractNumberFromText(text);
          } else if (href.includes('/following/')) {
            followingCount = extractNumberFromText(text);
          }
        });
      }

      // If still not found, try one last method with spans
      if (followerCount === null || followingCount === null) {
        // Look for spans with numbers
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent.trim();
          if (text && /^[\d,.]+[KkMm]?$/.test(text)) {
            // Found a span with just a number, check parent element text
            const parentText = span.parentElement.textContent.toLowerCase();
            
            if (parentText.includes('follower') && followerCount === null) {
              followerCount = extractNumberFromText(text);
            } else if (parentText.includes('following') && followingCount === null) {
              followingCount = extractNumberFromText(text);
            }
          }
        }
      }

      return { followerCount, followingCount };
    } catch (error) {
      return { followerCount: null, followingCount: null };
    }
  }
  
  // Helper function to extract numbers from text (e.g., "1,234" or "1.2K")
  function extractNumberFromText(text) {
    if (!text) {
      return null;
    }
    
    
    // First find any number-like pattern in the text
    const matches = text.match(/[\d,]+(\.\d+)?[KkMm]?/);
    if (!matches || matches.length === 0) {
      return null;
    }
    
    let numStr = matches[0];
    
    // Handle formats like 1.2K, 1.2M, etc.
    if (numStr.match(/[KkMm]$/)) {
      const multiplier = numStr.endsWith('K') || numStr.endsWith('k') ? 1000 : 1000000;
      const baseNum = parseFloat(numStr.replace(/[KkMm]$/, ''));
      const result = Math.round(baseNum * multiplier);
      return result;
    } else {
      // Remove commas and any non-numeric characters
      const result = parseInt(numStr.replace(/,/g, ''));
      return result;
    }
  }
}

// Function to store follower counts
function storeFollowerCounts() {

  // Check if we're on Instagram
  if (!window.location.href.includes("instagram.com/")) {
    alert("This script only works on Instagram pages");
    return;
  }

  // Extract username from URL
  const urlPath = window.location.pathname;
  const username = urlPath.split("/")[1];

  if (!username) {
    alert("Could not detect Instagram username");
    return;
  }

  function getCountsFromPage() {
    try {
      // For Instagram's new UI, the counts are typically in sections with specific order
      // Selector for the section that contains follower/following counts
      const sections = document.querySelectorAll('section ul li');
      
      let followerCount = null;
      let followingCount = null;
      
      // Instagram profile metrics are typically ordered: Posts, Followers, Following
      if (sections && sections.length >= 3) {
        // Try to extract from the text content, looking for spans with numbers
        sections.forEach((section, index) => {
          const countText = section.textContent;
          
          // Usually the 2nd item (index 1) is followers, 3rd item (index 2) is following
          if (index === 1 && countText.includes('follower')) {
            followerCount = extractNumberFromText(countText);
          } else if (index === 2 && countText.includes('following')) {
            followingCount = extractNumberFromText(countText);
          }
        });
      }
      
      // If we couldn't find them in the sections, try an alternative method
      if (followerCount === null || followingCount === null) {
        // Alternative selector to find links with follower/following counts
        const links = document.querySelectorAll('a[href*="/' + username + '/"]');
        
        links.forEach(link => {
          const href = link.getAttribute('href');
          const text = link.textContent;
          
          // Extract counts from the link text
          if (href.includes('/followers/')) {
            followerCount = extractNumberFromText(text);
          } else if (href.includes('/following/')) {
            followingCount = extractNumberFromText(text);
          }
        });
      }

      // If still not found, try one last method with spans
      if (followerCount === null || followingCount === null) {
        // Look for spans with numbers
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent.trim();
          if (text && /^[\d,.]+[KkMm]?$/.test(text)) {
            // Found a span with just a number, check parent element text
            const parentText = span.parentElement.textContent.toLowerCase();
            
            if (parentText.includes('follower') && followerCount === null) {
              followerCount = extractNumberFromText(text);
            } else if (parentText.includes('following') && followingCount === null) {
              followingCount = extractNumberFromText(text);
            }
          }
        }
      }

      return { followerCount, followingCount };
    } catch (error) {
      return { followerCount: null, followingCount: null };
    }
  }

  // Helper function to extract numbers from text (e.g., "1,234" or "1.2K")
  function extractNumberFromText(text) {
    if (!text) {
      return null;
    }
    
    
    // First find any number-like pattern in the text
    const matches = text.match(/[\d,]+(\.\d+)?[KkMm]?/);
    if (!matches || matches.length === 0) {
      return null;
    }
    
    let numStr = matches[0];
    
    // Handle formats like 1.2K, 1.2M, etc.
    if (numStr.match(/[KkMm]$/)) {
      const multiplier = numStr.endsWith('K') || numStr.endsWith('k') ? 1000 : 1000000;
      const baseNum = parseFloat(numStr.replace(/[KkMm]$/, ''));
      const result = Math.round(baseNum * multiplier);
      return result;
    } else {
      // Remove commas and any non-numeric characters
      const result = parseInt(numStr.replace(/,/g, ''));
      return result;
    }
  }

  // Get the counts
  const { followerCount, followingCount } = getCountsFromPage();
  
  if (followerCount === null && followingCount === null) {
    alert("Could not find follower and following counts");
    return;
  }

  // Use the provided timestamp and user

  // Create data object to store
  const data = {
    username: username,
    followerCount: followerCount,
    followingCount: followingCount,
    timestamp: Date().toLocaleString()
  };

  // Use chrome.runtime.sendMessage to access chrome.storage from popup
  chrome.runtime.sendMessage({
    action: "storeData",
    key: `instagram_stats_${username}`,
    data: data
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message) => {
  
  if (message.action === "showCompareResults") {
    document.getElementById("userList").style.display = "none";
    const resultsDiv = document.getElementById("compareResults");
    resultsDiv.innerHTML = message.data;
    resultsDiv.style.display = "flex";
    document.getElementById("backButton").style.display = "block";
    document.getElementById("clearListBtn").style.display = "block";
  }
  else if (message.action === "storeData") {
    const storageKey = message.key;
    chrome.storage.local.get([storageKey], (result) => {
      let dataArray = [];
      if (result[storageKey]) {
        try {
          dataArray = JSON.parse(result[storageKey]);
          if (!Array.isArray(dataArray)) {
            dataArray = [dataArray];
          }
          if (dataArray.length > 0) {
            const lastEntry = dataArray[dataArray.length - 1];
            if (lastEntry.followerCount === message.data.followerCount && 
                lastEntry.followingCount === message.data.followingCount) {
              showPageAlert(`Stats for ${message.data.username} is already up to date.`);
              return;
            }
          }
        } catch (e) {
          dataArray = [];
        }
      }
      
      dataArray.push(message.data);
      chrome.storage.local.set({[storageKey]: JSON.stringify(dataArray)}, () => {
        showPageAlert(`Stored stats for ${message.data.username}:\nDate: ${message.data.timestamp}\nFollowers: ${message.data.followerCount}\nFollowing: ${message.data.followingCount}`);
        updateStatsCount(); // Update the counter
      });
    });
  }
  else if (message.action === "getStoredData") {
    const storageKey = `instagram_stats_${message.username}`;
    
    chrome.storage.local.get([storageKey], (result) => {
      let dataArray = [];
      let lastEntry = null;
      
      if (result[storageKey]) {
        try {
          dataArray = JSON.parse(result[storageKey]);
          if (!Array.isArray(dataArray)) {
            dataArray = [dataArray];
          }
          
          if (dataArray.length > 0) {
            lastEntry = dataArray[dataArray.length - 1];
          }
        } catch (e) {
          dataArray = [];
        }
      }
      
      if (!lastEntry) {
        const initialData = [{
          username: message.username,
          followerCount: message.followerCount,
          followingCount: message.followingCount,
          timestamp: message.timestamp
        }];
        
        chrome.storage.local.set({[storageKey]: JSON.stringify(initialData)}, () => {
          
          // Show results div with new card UI for initial data
          const resultsDiv = document.getElementById("compareResults");
          resultsDiv.innerHTML = `
            <div class="stats-card">
              <div class="stats-header">
                <div class="user-info">
                  <div class="user-avatar">
                    <i class="fas fa-user"></i>
                  </div>
                  <div>
                    <p class="username">@${message.username}</p>
                    <p class="timestamp">First check: ${message.timestamp}</p>
                  </div>
                </div>
                <div class="stats-icon">
                  <i class="fas fa-eye"></i>
                </div>
              </div>
              <div class="stats-grid">
                <div class="stats-box">
                  <p class="stats-label">Followers</p>
                  <div class="stats-value-container">
                    <p class="stats-value">${formatNumber(message.followerCount)}</p>
                    <p class="stats-neutral">Initial</p>
                  </div>
                </div>
                <div class="stats-box">
                  <p class="stats-label">Following</p>
                  <div class="stats-value-container">
                    <p class="stats-value">${formatNumber(message.followingCount)}</p>
                    <p class="stats-neutral">Initial</p>
                  </div>
                </div>
              </div>
              <div class="stats-footer">
                <span class="stats-history-link" onclick="showHistory('${message.username}')">View History</span>
                <button class="stats-update-btn">Update Stats</button>
              </div>
            </div>
          `;
          document.getElementById("userList").style.display = "none";
          resultsDiv.style.display = "flex";
          document.getElementById("backButton").style.display = "block";
          document.getElementById("clearListBtn").style.display = "block";
        });
        return;
      }
      
      // Calculate changes
      const followerChange = message.followerCount - lastEntry.followerCount;
      const followingChange = message.followingCount - lastEntry.followingCount;
      
      // Check if this is a duplicate
      const isDuplicate = 
        lastEntry.followerCount === message.followerCount && 
        lastEntry.followingCount === message.followingCount;
      
      // Only add if not a duplicate
      if (!isDuplicate) {
        const newData = {
          username: message.username,
          followerCount: message.followerCount,
          followingCount: message.followingCount,
          timestamp: message.timestamp
        };
        
        dataArray.push(newData);
        chrome.storage.local.set({[storageKey]: JSON.stringify(dataArray)});
      }
    
      // Create the new styled UI
      const resultsDiv = document.getElementById("compareResults");
      resultsDiv.innerHTML = `
        <div class="stats-card">
          <div class="stats-header">
            <div class="user-info">
              <div class="user-avatar">
                <i class="fas fa-user"></i>
              </div>
              <div>
                <p class="username">@${message.username}</p>
                <p class="timestamp">Last checked: ${message.timestamp}</p>
              </div>
            </div>
          
          </div>
          <div class="stats-grid">
            <div class="stats-box">
              <p class="stats-label">Followers</p>
              <div class="stats-value-container">
                <p class="stats-value">${formatNumber(message.followerCount)}</p>
                <p class="${getChangeClass(followerChange)}">${formatChangeWithEmoji(followerChange)}</p>
              </div>
            </div>
            <div class="stats-box">
              <p class="stats-label">Following</p>
              <div class="stats-value-container">
                <p class="stats-value">${formatNumber(message.followingCount)}</p>
                <p class="${getChangeClass(followingChange)}">${formatChangeWithEmoji(followingChange)}</p>
              </div>
            </div>
          </div>
          <div class="stats-footer">
            <span class="stats-history-link" onclick="showHistory('${message.username}')">View History</span>
            <button class="stats-update-btn">Update Stats</button>
          </div>
        </div>
      `;

      document.getElementById("userList").style.display = "none";
      resultsDiv.style.display = "flex";
      resultsDiv.classList.add("stats-results");
      document.getElementById("backButton").style.display = "block";
    });
  }
});

// Helper functions for formatting
function formatNumber(num) {
  if (num === null || num === undefined) return "N/A";
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function getChangeClass(change) {
  if (change > 0) return "stats-positive";
  if (change < 0) return "stats-negative";
  return "stats-neutral";
}

function formatChangeWithEmoji(change) {
  if (change === 0) return "No change";
  const emoji = change > 0 ? "🔥" : "💀";
  const prefix = change > 0 ? "+" : "";
  return `${prefix}${formatNumber(change)} ${emoji}`;
}

chrome.storage.local.get(null, (items) => {
  let count = 0;
  for (const key in items) {
    if (key.startsWith("instagram_stats_")) {
      count++;
    }
  }
  
  // Update the stats display
  updateStatsDisplay(count);
});

// Function to update stats display
function updateStatsCount() {
  chrome.storage.local.get(null, (items) => {
    let count = 0;
    for (const key in items) {
      if (key.startsWith("instagram_stats_")) {
        count++;
      }
    }
    updateStatsDisplay(count);
  });
}

function updateStatsDisplay(count) {
  const trackedCountElement = document.getElementById("trackedCount");
  if (trackedCountElement) {
    if (count === 0) {
      trackedCountElement.textContent = "No profiles tracked yet";
    } else {
      trackedCountElement.textContent = `Tracking ${count} profile${count > 1 ? 's' : ''}`;
    }
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("clearListBtn")?.addEventListener("click", clearStoredData);
  document.getElementById("exportBtn")?.addEventListener("click", exportData);
  
  // Modal event listeners (moved to above function)
});
function clearStoredData() {
  
  // If we're in the comparison view for a specific user
  if (document.getElementById("compareResults").style.display === "block") {
    // Extract username from the comparison results heading
    const heading = document.getElementById("compareResults").querySelector("h3");
    if (heading && heading.textContent) {
      const match = heading.textContent.match(/Comparison for (.+)/) || 
                   heading.textContent.match(/Initial data for (.+)/);
      
      if (match && match[1]) {
        const username = match[1];
        const storageKey = `instagram_stats_${username}`;
        
        if (username) {
          chrome.storage.local.remove(storageKey, () => {
            document.getElementById("backButton").click();
          });
        }
        return;
      }
    }
  }
  
  // If we're in the user list view or couldn't determine specific user
  if (confirm("Are you sure you want to clear ALL stored Instagram data?")) {
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = [];
      for (const key in items) {
        if (key.startsWith("instagram_stats_")) {
          keysToRemove.push(key);
        }
      }
      
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => {
          showPageAlert(`Cleared all stored Instagram stats (${keysToRemove.length} profiles)`);
          
          // Return to main view
          document.getElementById("backButton").click();
        });
      } else {
        showPageAlert("No stored data to clear");
      }
    });
  }
}

// Export data functionality
function exportData() {
  chrome.storage.local.get(null, (items) => {
    const exportData = {
      exportDate: new Date().toISOString(),
      version: "1.0",
      data: {}
    };
    
    // Filter only Instagram stats and notes
    for (const key in items) {
      if (key.startsWith("instagram_stats_")) {
        const username = key.replace("instagram_stats_", "");
        try {
          const userData = JSON.parse(items[key]);
          exportData.data[username] = {
            stats: userData,
            notes: items[`notes_${username}`] || null
          };
        } catch (e) {
          // Skip invalid data
          continue;
        }
      }
    }
    
    if (Object.keys(exportData.data).length === 0) {
      showPageAlert("No data to export");
      return;
    }
    
    // Create download
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `instayou-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showPageAlert(`Exported data for ${Object.keys(exportData.data).length} profiles`);
  });
}

// Show historical timeline for a user
function showHistory(username) {
  const storageKey = `instagram_stats_${username}`;
  
  chrome.storage.local.get([storageKey], (result) => {
    let dataArray = [];
    
    if (result[storageKey]) {
      try {
        dataArray = JSON.parse(result[storageKey]);
        if (!Array.isArray(dataArray)) {
          dataArray = [dataArray];
        }
      } catch (e) {
        dataArray = [];
      }
    }
    
    if (dataArray.length === 0) {
      showPageAlert("No history found for this user");
      return;
    }
    
    // Sort by timestamp (newest first)
    dataArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    let historyHTML = `
      <div class="history-container">
        <div class="history-header">
          <h3>@${username} History</h3>
          <p>${dataArray.length} record${dataArray.length > 1 ? 's' : ''}</p>
        </div>
        <div class="history-timeline">
    `;
    
    for (let i = 0; i < dataArray.length; i++) {
      const entry = dataArray[i];
      const prevEntry = i < dataArray.length - 1 ? dataArray[i + 1] : null;
      
      const followerChange = prevEntry ? entry.followerCount - prevEntry.followerCount : 0;
      const followingChange = prevEntry ? entry.followingCount - prevEntry.followingCount : 0;
      
      historyHTML += `
        <div class="history-entry">
          <div class="history-date">${entry.timestamp}</div>
          <div class="history-stats">
            <div class="history-stat">
              <span>Followers: ${formatNumber(entry.followerCount)}</span>
              ${prevEntry ? `<span class="${getChangeClass(followerChange)}">${formatChangeWithEmoji(followerChange)}</span>` : '<span class="stats-neutral">Initial</span>'}
            </div>
            <div class="history-stat">
              <span>Following: ${formatNumber(entry.followingCount)}</span>
              ${prevEntry ? `<span class="${getChangeClass(followingChange)}">${formatChangeWithEmoji(followingChange)}</span>` : '<span class="stats-neutral">Initial</span>'}
            </div>
          </div>
        </div>
      `;
    }
    
    historyHTML += `
        </div>
      </div>
    `;
    
    const resultsDiv = document.getElementById("compareResults");
    resultsDiv.innerHTML = historyHTML;
    resultsDiv.style.display = "flex";
    document.getElementById("userList").style.display = "none";
    document.getElementById("backButton").style.display = "block";
    document.getElementById("clearListBtn").style.display = "block";
    document.getElementById("exportBtn").style.display = "block";
  });
}

// Update all tracked users functionality
function updateAllTrackedUsers() {
  chrome.storage.local.get(null, (items) => {
    const usernames = [];
    for (const key in items) {
      if (key && key.startsWith("instagram_stats_")) {
        const username = key.replace("instagram_stats_", "");
        usernames.push(username);
      }
    }
    
    if (usernames.length === 0) {
      showPageAlert("No tracked users found");
      return;
    }
    
    // Show confirmation dialog
    if (!confirm(`Update stats for all ${usernames.length} tracked users? This will open each profile in sequence.`)) {
      return;
    }
    
    // Start the update process
    document.getElementById("mainText").textContent = "Updating all users... Please wait";
    document.getElementById("mainButtons").style.display = "none";
    
    let currentIndex = 0;
    let successCount = 0;
    let errorCount = 0;
    
    function updateNextUser() {
      if (currentIndex >= usernames.length) {
        // All done
        showPageAlert(`Update complete! Success: ${successCount}, Errors: ${errorCount}`);
        document.getElementById("mainText").textContent = "Upgrade Your Stalking Skills 🚀";
        document.getElementById("mainButtons").style.display = "flex";
        return;
      }
      
      const username = usernames[currentIndex];
      document.getElementById("mainText").textContent = `Updating ${currentIndex + 1}/${usernames.length}: @${username}`;
      
      // Navigate to the user's profile and update stats
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const targetUrl = `https://www.instagram.com/${username}/`;
        
        chrome.tabs.update(tabs[0].id, { url: targetUrl }, () => {
          // Wait for page to load, then update stats
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              function: storeFollowerCounts,
            }).then(() => {
              successCount++;
              currentIndex++;
              setTimeout(updateNextUser, 2000); // Wait 2 seconds between updates
            }).catch(() => {
              errorCount++;
              currentIndex++;
              setTimeout(updateNextUser, 2000);
            });
          }, 3000); // Wait 3 seconds for page to load
        });
      });
    }
    
    updateNextUser();
  });
}

// Show notes dialog for a user
function showNotesDialog(username) {
  const modal = document.getElementById("notesModal");
  const textarea = document.getElementById("notesTextarea");
  const title = document.getElementById("notesModalTitle");
  
  title.textContent = `Notes for @${username}`;
  
  // Load existing notes
  chrome.storage.local.get([`notes_${username}`], (result) => {
    textarea.value = result[`notes_${username}`] || '';
    modal.style.display = "flex";
    textarea.focus();
  });
  
  // Store current username for saving
  modal.dataset.username = username;
}

// Initialize modal event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("clearListBtn")?.addEventListener("click", clearStoredData);
  document.getElementById("exportBtn")?.addEventListener("click", exportData);
  
  // Modal event listeners
  const modal = document.getElementById("notesModal");
  const closeModal = document.getElementById("closeModal");
  const saveNotes = document.getElementById("saveNotes");
  const cancelNotes = document.getElementById("cancelNotes");
  const sortSelect = document.getElementById("sortSelect");
  
  // Sort event listener
  sortSelect?.addEventListener("change", () => {
    if (document.getElementById("userList").style.display === "flex") {
      showSavedUsersList();
    }
  });
  
  const hideModal = () => {
    modal.style.display = "none";
    document.getElementById("notesTextarea").value = "";
  };
  
  closeModal?.addEventListener("click", hideModal);
  cancelNotes?.addEventListener("click", hideModal);
  
  saveNotes?.addEventListener("click", () => {
    const username = modal.dataset.username;
    const notes = document.getElementById("notesTextarea").value.trim();
    const key = `notes_${username}`;
    
    if (notes) {
      chrome.storage.local.set({[key]: notes}, () => {
        showPageAlert(`Notes saved for @${username}`);
        hideModal();
      });
    } else {
      // Remove notes if empty
      chrome.storage.local.remove(key, () => {
        showPageAlert(`Notes removed for @${username}`);
        hideModal();
      });
    }
  });
  
  // Close modal when clicking outside
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      hideModal();
    }
  });
});