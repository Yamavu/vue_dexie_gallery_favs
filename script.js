const { createApp, reactive , ref} = Vue;

if (typeof createApp !== "function" || typeof reactive !== "function")
  console.log("Vue.js not available");
if (typeof Dexie !== "function") console.log("Dexie not available");

const IDB_Name = "Gallery";
const IDB_Stores = {
  images: "++id, title, url",
  cart: "&id, title, url",
};
const ImageFolder = "img/";
const maxImages = 4;

async function loadItemsFromCSV(db, csvPath) {
  try {
    const csvData = await fetch(csvPath).then((response) => response.text());
    const lines = csvData.trim().split("\n");
    const headers = lines[0].split(",");
    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(",");
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = fields[j].trim();
      }
      items.push(obj);
    }
    await db.images.bulkAdd(items);
    console.log("Data loaded from CSV and added to database.");
  } catch (error) {
    console.error("Error loading items from CSV:", error);
  }
}

const db = new Dexie(IDB_Name);

db.version(1).stores(IDB_Stores);
db.on("populate", async (trans) => {
  console.log("Populating database with initial data...");
  await loadItemsFromCSV(db, "items.csv");
  console.log("Initial data added to the database.");
});

createApp({
  data() {
    return {
      db: db,
      images: [],
      cart: [],
      searchQuery: "",
    };
  },
  computed: {
    sum() {
      const sum_w = this.cart.reduce(function (weight, item) {
        return weight + Number(item.weight);
      }, 0);
      return (`${sum_w.toFixed(2)}`)
    },
    filteredImages(){
      return this.images;
    },
  },
  watch:{ 
    filter(old,filter) {
      /*var images = this.images;
      var filter = this.filter;
      const filterExp = new RegExp(filter, "i");
      console.log(filter);
      db.images
        .filter(image => image.title.search( filterExp ) ) 
        .toArray()
        .then(data => {
          console.log(data)
          images.value = data;
        });
*/
    }
  },
  methods: {
    /**
     * Perform a search based on the search query.
     */
    async performSearch() {
      const searchTerm = this.searchQuery.toLowerCase().trim();
      if (searchTerm.length < 3) {
        this.$fetch(); // This will call getDataFromIDB again
      } else {
        const filteredImages = await db.images
          .filter(image => image.title.toLowerCase().includes(searchTerm))
          .toArray();
        this.images = filteredImages; // Images are updated here
      }
    },
    /**
     * An asynchronous function to fetch data.
     *
     * @return {Promise} The value of images after fetching from the database.
     */
    async $fetch() {
      this.images = await db.images.toArray();
    },
    /**
     * Adds the provided image to the cart after converting it to a cart item.
     *
     * @param {type} image - the image to be added to the cart
     * @return {type} description of return value
     */
    async addToCart(image) {
      try {
        var cart_image = await this.itemToCartitem(image);
        console.log(`adding image with id ${cart_image.imageId} to cart with id ${cart_image.id}`);
        this.cart.push(cart_image);
        await this.db.cart.put(cart_image);
      } catch (error) {
        console.error("Error adding image to cart:", error);
      }
    },
    /**
     * Asynchronously converts item to cartitem by processing the image data and calculating file size.
     *
     * @param {Object} image - The image object to be converted to cartitem.
     * @return {Object} The cartitem object with image data, file size, image ID, and ID.
     */
    async itemToCartitem(image) {
      const image_data = await this.imageDataUrl(this.imageUrl(image.url));
      const fileSize = (atob(image_data.split(',')[1])).length;
      return {
        ...image,
        image_data: image_data,
        fileSize: fileSize,
        imageId: image.id,
        id: this.cart.length + 1,
      };
    },
    /**
     * Remove an image from the cart based on the provided cart_image.
     *
     * @param {Object} cart_image - The image object to be removed from the cart.
     * @return {Promise} - A Promise that resolves after the image is successfully removed.
     */
    async removeFromCart(cart_image) {
      console.log(`removing image with id ${cart_image.id} from cart`);
      try {
        this.cart.splice(cart_image.id, 1);
        this.cart.pop(cart_image);
        await this.db.cart.delete(cart_image.id);
      } catch (error) {
        console.error("Error removing image from cart:", error);
      }
    },
    /**
     * Check if the given image is in the cart.
     *
     * @param {Object} image - The image to check.
     * @return {boolean} Whether the image is in the cart or not.
     */
    isInCart(image) {
      return this.cart.some((image_) => image.id === image_.imageId);
    },
    /**
     * Toggle the selection of an image in the cart.
     *
     * @param {type} image - the image to toggle selection for
     * @return {type} 
     */
    toggleImageSelection(image) {
      if (this.isInCart(image)) this.removeFromCart(image);
      else this.addToCart(image);
    },
    /**
     * Async function to retrieve data from IndexedDB and load images and cart items.
     *
     * @return {Promise<void>} Promise that resolves once data is loaded from IndexedDB
     */
    async getDataFromIDB() {
      try {
        console.log("loading images from IndexedDB");
        const loadedImages = await db.images.toArray();
        const loadedCart = await db.cart.toArray();
        this.images.push(...loadedImages);
        this.cart.push(...loadedCart);
      } catch (error) {
        console.error("Error loading images from IndexedDB:", error);
      }
    },
    imageUrl(url) {
      return ImageFolder + url;
    },
    /**
     * Retrieves the data URL of an image from the specified URL.
     *
     * @param {string} url - The URL of the image
     * @return {Promise<string>} A promise that resolves with the data URL of the image
     */
    async imageDataUrl(url) {
      try {
        // Fetch the image data
        const response = await fetch(url);
        const blob = await response.blob();
    
        // Convert the blob data into a data URL
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error('Error fetching image data:', error);
        throw error; // Rethrow the error for handling outside of this function
      }
    },
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const sizes = ['B', 'KiB', 'MiB', 'GiB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      const size = parseFloat((bytes / Math.pow(1024, i)).toFixed(2));

      return `${size}${sizes[i]}`;
    },
  },
  mounted() {
    this.getDataFromIDB();
  },
}).mount("#app");
